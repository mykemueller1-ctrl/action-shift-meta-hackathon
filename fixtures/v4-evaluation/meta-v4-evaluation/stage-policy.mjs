import {fail} from './budget-policy.mjs';
export function confirmationEligible(protocol,ledger,review,evidenceHashes){
  const initial=protocol.runs.filter(run=>run.phase==='initial');
  if(initial.length!==12||!review||review.reviewer!=='Independent Codex agent'||!Array.isArray(review.runs)||review.runs.length!==12)return false;
  const candidatePass={B:0,C:0};const seen=new Set();
  for(const planned of initial){const run=ledger.runs.find(item=>item.id===planned.id);const outcome=review.runs.find(item=>item.runId===planned.id);
    if(!run||!['completed-awaiting-independent-review','failed-output-no-retry'].includes(run.status)||!outcome||seen.has(outcome.runId)
      ||outcome.caseId!==planned.caseId||outcome.arm!==planned.armId||typeof outcome.criticalPass!=='boolean'||outcome.evidenceSha256!==evidenceHashes[planned.id])return false;
    if(run.status==='failed-output-no-retry'&&outcome.criticalPass)return false;
    seen.add(outcome.runId);if(outcome.criticalPass&&Object.hasOwn(candidatePass,planned.armId))candidatePass[planned.armId]++;
  }return candidatePass.B===4||candidatePass.C===4;
}
export function canContinueAfterModelFailure(code,runRequests,unchanged,secretDetected){
  return ['FRONT_DESK_OUTPUT','FRONT_DESK_REQUEST_LIMIT','FRONT_DESK_CONTEXT_LIMIT'].includes(code)
    &&runRequests.length>0&&runRequests.every(item=>item.status==='completed-usage-reported')&&unchanged&&!secretDetected;
}
