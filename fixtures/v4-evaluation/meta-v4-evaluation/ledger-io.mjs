import {open,readFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fail} from './budget-policy.mjs';
export async function atomicJson(filename,value) {
  const temporary=filename+'.'+randomUUID()+'.tmp';let handle;
  try { handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();await handle.close();handle=null;await rename(temporary,filename); }
  catch(error){if(handle)await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw error;}
}
export async function acquireLock(filename) {
  let handle;const token=randomUUID();
  try {handle=await open(filename,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('EVAL_LOCKED');throw error;}
  try {await handle.writeFile(JSON.stringify({token,pid:process.pid,startedAt:new Date().toISOString()}));await handle.sync();}
  catch(error){await handle.close().catch(()=>{});await unlink(filename).catch(()=>{});throw error;}
  return async()=>{await handle.close();let current;try{current=JSON.parse(await readFile(filename,'utf8'));}catch{fail('EVAL_LOCK_OWNERSHIP');}if(current.token!==token)fail('EVAL_LOCK_OWNERSHIP');await unlink(filename);};
}
export function sanitize(value,key,depth=0){
  if(typeof key!=='string'||key.length<1)fail('EVAL_KEY_MISSING');
  if(depth>32)return '[TRUNCATED]';
  if(typeof value==='string')return value.split(key).join('[REDACTED_CREDENTIAL]');
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.slice(0,2000).map(item=>sanitize(item,key,depth+1));
  if(value.type==='reasoning')return {type:'reasoning',content:'[OMITTED]'};
  const result=Object.create(null);
  for(const[name,item]of Object.entries(value)){
    const normalized=name.replace(/[_-]/g,'').toLowerCase();
    if(['authorization','apikey','modelapikey','headers','requestheaders','responseheaders','encryptedcontent','reasoning'].includes(normalized))result[name]='[OMITTED]';
    else result[name.split(key).join('[REDACTED_CREDENTIAL]')]=sanitize(item,key,depth+1);
  }return result;
}
