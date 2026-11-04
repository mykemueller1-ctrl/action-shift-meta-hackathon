import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewFrontDesk, frontDeskModelInput} from './front-desk-meta.mjs';
import {createFrontDeskDemo} from '../action-shift-v3/src/front-desk.mjs';
const packet={synthetic:true,scenarioId:'unseen-demo',restaurantId:'demo-north',demoNow:'2026-11-04T10:00:00-06:00',message:'Can our crew get the advertised lunch today?'};
const answer={intent:'workplace-meal',status:'needs-clarification',summary:'The requested meal needs a current menu and quantity check.',reply:'I can help prepare a request. How many meals do you need?',questions:['How many meals do you need?'],sourceIds:['fact-menu'],proposal:null};
const factResult={restaurantId:'demo-north',sources:[{id:'fact-menu',text:'The fictional current menu is available for owner review.'}]};
const call=(name='lookup_restaurant_facts',args={date:'2026-11-04',topics:['menu']},call_id='call_demo')=>({type:'function_call',name,arguments:JSON.stringify(args),call_id,status:'completed'});
const envelope=output=>({id:'resp_demo',model:'muse-spark-1.3',status:'completed',usage:{input_tokens:100,output_tokens:100},output});
const final=result=>({type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(result)}]});
const jsonResponse=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
function setup(responses){
  const bodies=[];const invocations=[];
  return {bodies,invocations,options:{apiKey:'unit-test-only-credential',fetchImpl:async(_url,init)=>{bodies.push(JSON.parse(init.body));assert.equal(init.redirect,'error');return jsonResponse(responses.shift());},lookupFacts:async args=>{invocations.push(args);return factResult;},checkQuantities:async()=>({sum:13,matched:false})}};
}

test('realistic tool loop preserves encrypted reasoning and phase, scopes facts, and returns only a proposal',async()=>{
  const s=setup([envelope([{type:'reasoning',id:'rs_demo',encrypted_content:'opaque-test-content',summary:[]},{type:'message',role:'assistant',phase:'commentary',status:'completed',content:[{type:'output_text',text:'I will check the current menu.'}]},call()]),envelope([final(answer)])]);
  const budget=[];const result=await reviewFrontDesk(packet,{...s.options,beforeRequest:async value=>budget.push(value)});
  assert.equal(result.mode,'mocked-review');assert.equal(result.liveVerified,false);assert.equal(result.receipt.transport,'mocked');
  assert.equal(result.tools.length,1);assert.equal(result.receipt.requests.length,2);assert.equal(budget.length,2);
  assert.deepEqual(s.invocations,[{restaurantId:'demo-north',date:'2026-11-04',topics:['menu']}]);
  const second=s.bodies[1];assert.equal(second.store,false);assert.deepEqual(second.include,['reasoning.encrypted_content']);assert.equal(second.previous_response_id,undefined);
  assert.equal(second.input[1].encrypted_content,'opaque-test-content');assert.equal(second.input[2].phase,'commentary');assert.equal(second.input[4].type,'function_call_output');
  assert.equal(second.input[4].call_id,'call_demo');assert.ok(!JSON.stringify(s.bodies[0]).includes('requiredReviewObligations'));
  assert.match(result.notice,/No customer message/);assert.deepEqual(packet.message,'Can our crew get the advertised lunch today?');
});

test('validates a whole tool batch before executing any function',async()=>{
  const s=setup([envelope([call(),call('approve_quote',{},'call_unauthorized')])]);
  await assert.rejects(reviewFrontDesk(packet,s.options),{code:'FRONT_DESK_TOOL_CALL'});assert.equal(s.invocations.length,0);
});

test('tool arguments cannot change restaurant scope or smuggle state writes',async()=>{
  const s=setup([envelope([call('lookup_restaurant_facts',{date:'2026-11-04',topics:['menu'],restaurantId:'other-restaurant'})])]);
  await assert.rejects(reviewFrontDesk(packet,s.options),{code:'FRONT_DESK_TOOL_ARGUMENTS'});assert.equal(s.invocations.length,0);
});

test('negative/fractional quantities are rejected before calculation',async()=>{
  let calculations=0;const s=setup([envelope([call('check_order_quantities',{headlineQuantity:12,items:[{itemId:'pizza',quantity:1.5}],windows:[]})])]);
  await assert.rejects(reviewFrontDesk(packet,{...s.options,checkQuantities:async()=>{calculations++;return {};}}),{code:'FRONT_DESK_TOOL_ARGUMENTS'});assert.equal(calculations,0);
});

test('a request budget veto prevents the paid transport',async()=>{
  const s=setup([]);await assert.rejects(reviewFrontDesk(packet,{...s.options,beforeRequest:async()=>{throw new Error('Test budget reached');}}),/Test budget reached/);assert.equal(s.bodies.length,0);
});

test('scenario labels and expected answers cannot cue a model request',async()=>{
  const local={...packet,scenarioId:'pickup-only-wrong-count-test'};
  const s=setup([envelope([final({...answer,sourceIds:[]})])]);
  const result=await reviewFrontDesk(local,s.options);
  const visible=JSON.parse(s.bodies[0].input[0].content[0].text);
  assert.deepEqual(visible,{synthetic:true,restaurantId:local.restaurantId,demoNow:local.demoNow,message:local.message});
  assert.ok(!JSON.stringify(s.bodies).includes(local.scenarioId));
  assert.deepEqual(result.modelInput,visible);
  assert.equal(result.scenarioId,local.scenarioId);
  assert.deepEqual(frontDeskModelInput({...local,scenarioId:'unrelated-local-receipt'}),visible);
  await assert.rejects(reviewFrontDesk({...local,expected:{intent:'workplace-meal'}},s.options),{code:'FRONT_DESK_INPUT'});
});

test('a request cap prevents a recursive model loop and performs no retry',async()=>{
  const s=setup([envelope([call()])]);await assert.rejects(reviewFrontDesk(packet,{...s.options,maxRequests:1}),{code:'FRONT_DESK_REQUEST_LIMIT'});assert.equal(s.bodies.length,1);
});

test('unretrieved source IDs and extra action fields cannot enter accepted results',async()=>{
  for(const result of [{...answer,sourceIds:['invented-fact']},{...answer,orderConfirmed:true}]){
    const s=setup([envelope([call()]),envelope([final(result)])]);await assert.rejects(reviewFrontDesk(packet,s.options),{code:'FRONT_DESK_OUTPUT'});
  }
});

test('opaque reasoning must be replayable rather than referencing an unstored ID',async()=>{
  const s=setup([envelope([{type:'reasoning',id:'rs_unstored',summary:[]},call()])]);await assert.rejects(reviewFrontDesk(packet,s.options),{code:'FRONT_DESK_REASONING_REPLAY'});assert.equal(s.bodies.length,1);
});

test('provider errors never expose bodies, credentials or raw transport exceptions',async()=>{
  const s=setup([]);let read=false;
  await assert.rejects(reviewFrontDesk(packet,{...s.options,fetchImpl:async()=>({ok:false,status:429,body:{cancel:async()=>{}},text:async()=>{read=true;return 'secret-body';}})}),e=>e.code==='FRONT_DESK_HTTP'&&e.upstreamStatus===429&&!JSON.stringify(e).includes('secret-body'));
  assert.equal(read,false);
  await assert.rejects(reviewFrontDesk(packet,{...s.options,fetchImpl:async()=>{throw new Error('unit-test-only-credential');}}),e=>e.code==='FRONT_DESK_NETWORK'&&!JSON.stringify(e).includes('credential'));
});

test('final provenance does not accept the wrong model or an unmarked input',async()=>{
  const bad=envelope([final({...answer,sourceIds:[]})]);bad.model='other-model';const s=setup([bad]);await assert.rejects(reviewFrontDesk(packet,s.options),{code:'FRONT_DESK_PROTOCOL'});
  await assert.rejects(reviewFrontDesk({...packet,synthetic:false},s.options),{code:'FRONT_DESK_INPUT'});
});

test('diagnostic callback excludes opaque reasoning and redacts the configured credential',async()=>{
  const result={...answer,sourceIds:[],reply:'Draft unit-test-only-credential'};const s=setup([envelope([{type:'reasoning',encrypted_content:'opaque-private',summary:[]},final(result)])]);let captured;
  await assert.rejects(reviewFrontDesk(packet,{...s.options,onTurn:async value=>{captured=value;}}),{code:'FRONT_DESK_OUTPUT'});
  assert.ok(!JSON.stringify(captured).includes('opaque-private'));assert.ok(!JSON.stringify(captured).includes('unit-test-only-credential'));assert.match(JSON.stringify(captured),/REDACTED/);
});

const foodProposal=()=>({kind:'food',date:'2026-11-04',fulfillment:'pickup',headlineQuantity:2,
  items:[{itemId:'cheese',quantity:2}],windows:[{id:'midday',readyAt:'2026-11-04T13:00:00-06:00',items:[{itemId:'cheese',quantity:2}]}],destination:'Fictional pickup counter'});
async function acceptProposal(proposal,intent='direct-order'){
  const result={...answer,intent,sourceIds:[],proposal};const s=setup([envelope([final(result)])]);
  return reviewFrontDesk(packet,s.options);
}

test('non-order intents cannot carry a food proposal, but retain valid null proposals',async()=>{
  for(const intent of ['food-question','reservation','cancellation','recovery','relationship','human-review']){
    await assert.rejects(acceptProposal(foodProposal(),intent),{code:'FRONT_DESK_OUTPUT'});
    assert.equal((await acceptProposal(null,intent)).result.proposal,null);
  }
});

test('complete proposal dates reject impossible days, unsupported years and trailing text',async()=>{
  for(const date of ['2026-02-29','2026-02-31','2026-13-01','2025-11-04','2027-11-04','2026-11-04 extra']){
    const proposal=foodProposal();proposal.date=date;
    await assert.rejects(acceptProposal(proposal),{code:'FRONT_DESK_OUTPUT'});
  }
});

test('known service time must be an actual local time on the proposed service date',async()=>{
  for(const readyAt of ['2026-11-04T19:00:00Z','2026-11-04T13:00:00-05:00','2026-11-04T13:00-06:00','2026-11-05T13:00:00-06:00','2026-11-04T24:00:00-06:00','2026-11-04T13:60:00-06:00','2026-02-31T13:00:00-06:00']){
    const proposal=foodProposal();proposal.windows[0].readyAt=readyAt;
    await assert.rejects(acceptProposal(proposal),{code:'FRONT_DESK_OUTPUT'});
  }
});

test('destination is bounded and cannot contain markup or hidden controls',async()=>{
  for(const destination of ['x'.repeat(161),'   ','Fictional\nCounter','<b>Counter</b>','Fictional\u200bCounter']){
    const proposal=foodProposal();proposal.destination=destination;
    await assert.rejects(acceptProposal(proposal),{code:'FRONT_DESK_OUTPUT'});
  }
});

test('unknown proposal fields stay null and unexecuted instead of being filled with defaults',async()=>{
  const proposal={kind:'food',date:null,fulfillment:null,headlineQuantity:null,items:[],windows:[{id:'unknown',readyAt:null,items:[]}],destination:null};
  for(const intent of ['direct-order','workplace-meal'])assert.deepEqual((await acceptProposal(proposal,intent)).result.proposal,proposal);
});

test('a complete accepted proposal is compatible with the actual adoption and quote engine',async()=>{
  const proposal=foodProposal();proposal.destination='x'.repeat(160);
  const reviewed=await acceptProposal(proposal);const demo=createFrontDeskDemo();const before=demo.getCase('direct');
  const adopted=demo.action({caseId:'direct',expectedVersion:before.version,action:'apply_request_proposal',payload:{proposal:reviewed.result.proposal,operator:'Demo operator'}}).case;
  assert.equal(adopted.approval,null);assert.equal(adopted.quote,null);assert.equal(adopted.receipts.length,0);
  const quoted=demo.action({caseId:'direct',expectedVersion:adopted.version,action:'prepare_quote'}).case;
  assert.equal(quoted.quote.totalCents,3000);assert.equal(quoted.request.windows[0].readyAt,proposal.windows[0].readyAt);
});

test('unsupported or impossible fact dates are rejected before a tool is invoked',async()=>{
  for(const date of ['2027-01-01','2026-02-31','2026-02-29']){
    const s=setup([envelope([call('lookup_restaurant_facts',{date,topics:['menu']})])]);
    await assert.rejects(reviewFrontDesk(packet,s.options),{code:'FRONT_DESK_TOOL_ARGUMENTS'});assert.equal(s.invocations.length,0);
  }
});
