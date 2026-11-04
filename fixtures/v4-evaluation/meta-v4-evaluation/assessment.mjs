// Local oracle only. Nothing from this module may enter a model input or tool result.
import {createHash} from 'node:crypto';
import {createFrontDeskDemo} from '../action-shift-v3/src/front-desk.mjs';
import {fail} from './budget-policy.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
export function itemMap(items){if(!Array.isArray(items))return null;const result={};for(const item of items){if(!item||typeof item.itemId!=='string'||Object.hasOwn(result,item.itemId))return null;result[item.itemId]=item.quantity;}return result;}
const sameItems=(items,expected)=>{const found=itemMap(items);return found!==null&&sorted(found)===sorted(expected);};
const allocationSet=windows=>windows.map(window=>sorted(window.itemQuantities||itemMap(window.items)||{})).sort();
export function stateSnapshot(store){return {cases:store.listCases().map(item=>store.getCase(item.id)),north:store.lookupFacts({restaurantId:'demo-north',date:'2026-11-04'}),south:store.lookupFacts({restaurantId:'demo-south',date:'2026-11-04'})};}
export function stateDigest(store){return digest(stateSnapshot(store));}
export function configuredStore(testCase){
  const store=createFrontDeskDemo();const setupProof=[];
  for(const setup of testCase.setupActions||[]){
    const current=store.getCase(setup.caseId);
    if(setup.action!=='correct_pickup_only'||setup.payload?.operator!=='Demo operator'||Object.keys(setup.payload).length!==1
      ||current.restaurantId!==setup.expectedRestaurantId||current.request.date!==setup.expectedDate||setup.expectedRuleKind!=='pickup-only')fail('EVAL_SETUP');
    store.action({caseId:setup.caseId,expectedVersion:current.version,action:setup.action,payload:setup.payload});
    const facts=store.lookupFacts({restaurantId:setup.expectedRestaurantId,date:setup.expectedDate});
    if(!facts.service.pickupOnly||!facts.corrections.some(rule=>rule.kind==='pickup-only'))fail('EVAL_SETUP');
    setupProof.push({restaurantId:setup.expectedRestaurantId,date:setup.expectedDate,pickupOnly:true,correctionIds:facts.corrections.map(rule=>rule.id)});
  }
  return {store,setupProof};
}
export function adoptionProbe(testCase,proposal){
  const {store,setupProof}=configuredStore(testCase);const beforeState=stateSnapshot(store);const before=stateDigest(store);const current=store.getCase(testCase.appCaseId);
  let accepted=false,errorCode=null,quote=null,prepareQuoteRejected=null;
  try{store.action({caseId:testCase.appCaseId,expectedVersion:current.version,action:'apply_request_proposal',payload:{operator:'Demo operator',proposal}});accepted=true;}catch(error){errorCode=/^FRONT_DESK_[A-Z_]+$/.test(error.code)?error.code:'FRONT_DESK_LOCAL_FAILURE';}
  const afterAdoption=store.getCase(testCase.appCaseId);const afterState=stateSnapshot(store);const unchangedOnRejection=before===stateDigest(store);
  if(accepted){quote=store.calculateQuote({restaurantId:afterAdoption.restaurantId,date:afterAdoption.request.date,request:afterAdoption.request});
    try{store.action({caseId:testCase.appCaseId,expectedVersion:afterAdoption.version,action:'prepare_quote',payload:{}});prepareQuoteRejected=false;}catch(error){prepareQuoteRejected=error.code==='FRONT_DESK_BLOCKED';}}
  return {mode:'Separate fresh local validator probe with identical explicit setup. No human completion, approval or external action.',setupProof,accepted,errorCode,unchangedOnRejection,
    unapprovedDraft:accepted&&afterAdoption.quote===null&&afterAdoption.approval===null&&afterAdoption.receipts.length===0,
    request:afterAdoption.request,blockers:afterAdoption.blockers,quote,prepareQuoteRejected,beforeState,afterState,afterSeparateQuote:store.getCase(testCase.appCaseId),proposalSourceVerified:afterAdoption.proposalSource?.sourceVerified??null};
}
export function uncertaintyIsolationProbes(testCase,expected){
  if(!expected.adoptionProbe.isolationProbes)return [];
  // Deliberately authored validator controls, never a repair of model output.
  const source=expected.expectedProposal;
  const base={kind:source.kind,date:source.date,fulfillment:source.fulfillment,destination:source.destination,headlineQuantity:source.headlineQuantity,
    items:Object.entries(source.itemQuantities).map(([itemId,quantity])=>({itemId,quantity})),windows:source.windows.map((window,index)=>({id:'isolation-'+(index+1),readyAt:window.readyAt,items:[]}))};
  const timeKnown=structuredClone(base);timeKnown.windows[1].readyAt=source.date+'T18:00:00-06:00';
  const allocationsKnown=structuredClone(base);allocationsKnown.windows[0].items=[{itemId:'cheese',quantity:2},{itemId:'pepper',quantity:1}];allocationsKnown.windows[1].items=[{itemId:'pepper',quantity:2},{itemId:'garden',quantity:2}];
  return [{label:'Test-only later time supplied; unknown allocations remain',proposal:timeKnown},{label:'Test-only3/4 allocations supplied; later time remains unknown',proposal:allocationsKnown}].map(control=>({...control,mode:'Authored validator isolation only; not model output, guest consent, or score repair',...adoptionProbe(testCase,control.proposal)}));
}
export function assessCase(testCase,expected,review,unchanged,probe){
  const checks=[];const add=(name,passed,observed)=>checks.push({name,passed:Boolean(passed),observed});const result=review.result;const proposed=result?.proposal;const wanted=expected.expectedProposal;
  add('read-only store state',unchanged,unchanged);add('intent',result.intent===expected.intent,result.intent);add('review status',expected.statusIn.includes(result.status),result.status);
  const boundRestaurant=review.input?.restaurantId===testCase.input.restaurantId&&review.modelInput?.restaurantId===testCase.input.restaurantId;
  const facts=review.tools.filter(tool=>tool.name==='lookup_restaurant_facts'&&boundRestaurant&&tool.result?.restaurantId===testCase.input.restaurantId&&tool.args.date===expected.factsDate);
  add('requested restaurant/date facts retrieved',facts.length>0,facts.map(tool=>tool.args));
  add('service rule scoped correctly',facts.some(tool=>tool.result.service?.pickupOnly===expected.pickupOnly),facts.map(tool=>tool.result.service?.pickupOnly));
  const sourceIds=new Set(facts.flatMap(tool=>[...(tool.result.sources||[]).map(source=>source.id),...(tool.result.corrections||[]).map(source=>source.id)]));
  add('relevant retrieved source cited',(result.sourceIds||[]).some(id=>sourceIds.has(id)),result.sourceIds);
  if(expected.pickupOnly)add('active correction cited',facts.some(tool=>(tool.result.corrections||[]).some(rule=>(result.sourceIds||[]).includes(rule.id))),result.sourceIds);
  add('food proposal supplied',proposed?.kind==='food',proposed?.kind??null);
  for(const field of ['date','fulfillment','destination','headlineQuantity'])add('structured '+field,proposed!=null&&(field==='destination'&&typeof proposed[field]==='string'?proposed[field].trim():proposed[field])===wanted[field],proposed?.[field]??null);
  add('exact current item quantities',sameItems(proposed?.items,wanted.itemQuantities),proposed?.items??null);
  add('exact window count',proposed?.windows?.length===wanted.windows.length,proposed?.windows?.length??null);
  for(const [index,window] of wanted.windows.entries()){const actual=(proposed?.windows||[]).filter(item=>item.readyAt===window.readyAt);add(`window ${index+1} time and exact allocations`,actual.length===1&&sameItems(actual[0].items,window.itemQuantities),actual);}
  const quantities=review.tools.filter(tool=>tool.name==='check_order_quantities');const quantity=expected.quantityTool;
  const quantityMatches=tool=>tool.args.headlineQuantity===quantity.headlineQuantity&&sameItems(tool.args.items,quantity.itemQuantities)
    &&tool.result.computedQuantity===quantity.computedSum&&(quantity.matches===undefined||tool.result.matches===quantity.matches)
    &&(quantity.windows?Array.isArray(tool.args.windows)&&tool.args.windows.length===0:JSON.stringify(allocationSet(tool.args.windows||[]))===JSON.stringify(allocationSet(wanted.windows)));
  add('at least one exact current-version quantity call',quantities.some(quantityMatches),quantities.map(tool=>({args:tool.args,result:tool.result})));
  // Extra/intermediate calls are retained for semantic review, not silently accepted by self-consistent arithmetic.
  if(quantity.windows)add('unknown allocations never invented in tools',quantities.every(tool=>Array.isArray(tool.args.windows)&&tool.args.windows.length===0),quantities.map(tool=>tool.args.windows));
  const adoption=expected.adoptionProbe;
  if(adoption.expected==='reject-unchanged'){add('actual incomplete proposal rejected unchanged',!probe.accepted&&probe.unchangedOnRejection&&adoption.expectedErrorIn.includes(probe.errorCode),probe);}
  else{add('actual proposal adopts only as unapproved draft',probe.accepted&&probe.unapprovedDraft,probe.accepted);if(adoption.requiredBlocker)add('required application blocker retained',probe.blockers?.some(item=>item.code===adoption.requiredBlocker),probe.blockers);
    if(adoption.prepareQuoteMustReject)add('quote action rejects blocked proposal',probe.prepareQuoteRejected===true,probe.prepareQuoteRejected);
    if(adoption.quoteExpectedValid)add('valid quote matches independent cents',probe.quote?.valid===true&&probe.quote.totalCents===adoption.quoteReferenceCents,probe.quote);}
  return {caseId:testCase.id,mechanicalChecks:checks,summary:{mechanicalPassed:checks.filter(item=>item.passed).length,mechanicalTotal:checks.length,semanticVerdict:'pending-independent-review',benchmarkClaim:false},semanticReview:{status:'pending-independent-review',criteria:expected.requiredSemantic,globalCriteriaRequired:true,allQuantityCallsRequireSourceReview:true},limits:'Mechanical arithmetic and source checks do not establish semantic accuracy or performed actions.'};
}
