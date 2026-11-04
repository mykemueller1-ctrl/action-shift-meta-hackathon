// Isolated V4 accounting. Cached input is charged at the full input rate.
export const BASELINE = Object.freeze({ requestsStarted: 69, accountedAndReservedUsd: 0.533298, historicalUnknownReserveUsd: 0.1,
  sha256: '01a1f39c4db31e5d6c1f3f7dc60b654610415ce97c56a7150b4095460e0e2846' });
export const LIMITS = Object.freeze({ maxNewRequests: 54, maxTotalRequests: 123, maxRuns: 18, maxRequestsPerRun: 3,
  maxToolCalls: 8, maxPhaseSpendUsd: 3, maxTotalSpendUsd: 20, maxOutputTokens: 12000, maxRequestBytes: 160000, timeoutMs: 120000 });
export const RATES = Object.freeze({ 'muse-spark-1.3': Object.freeze({ input: 1.25, output: 4.25 }), 'muse-wonder-1.0': Object.freeze({ input: 4, output: 20 }) });
export const roundUp = value => Math.max(0, Math.ceil((value - 1e-12) * 1e6) / 1e6);
export function fail(code) { throw Object.assign(new Error(code), { code }); }
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function actualCost(model, input, output) {
  if (!RATES[model] || !integer(input) || !integer(output)) fail('EVAL_USAGE');
  return roundUp((input * RATES[model].input + output * RATES[model].output) / 1e6);
}
export function costs(ledger) {
  const phaseUsd = roundUp(ledger.requests.reduce((sum, item) => sum + item.accountedUsd, 0));
  return { phaseUsd, cumulativeUsd: roundUp(BASELINE.accountedAndReservedUsd + phaseUsd) };
}
export function validatePolicy(ledger) {
  if (ledger?.schemaVersion !== 1 || ledger.experimentId !== 'meta-v4-contract-and-model-01'
    || ledger.baseline?.requestsStarted !== BASELINE.requestsStarted || ledger.baseline?.accountedAndReservedUsd !== BASELINE.accountedAndReservedUsd
    || ledger.baseline?.historicalUnknownReserveUsd !== BASELINE.historicalUnknownReserveUsd || ledger.baseline?.sha256 !== BASELINE.sha256
    || JSON.stringify(ledger.limits) !== JSON.stringify(LIMITS) || !Array.isArray(ledger.requests) || !Array.isArray(ledger.runs)
    || ledger.totalRequestsStarted !== BASELINE.requestsStarted + ledger.requests.length || ledger.requests.length > LIMITS.maxNewRequests
    || ledger.runs.length > LIMITS.maxRuns) fail('EVAL_LEDGER');
  const runIds = new Set();
  for (const run of ledger.runs) {
    if (!run || typeof run.id !== 'string' || runIds.has(run.id) || !RATES[run.model] || run.reasoningEffort !== 'max'
      || !Array.isArray(run.requestNumbers) || run.requestNumbers.length > LIMITS.maxRequestsPerRun) fail('EVAL_LEDGER');
    runIds.add(run.id);
    const actual = ledger.requests.filter(entry => entry.runId === run.id).map(entry => entry.requestNumber);
    if (JSON.stringify(actual) !== JSON.stringify(run.requestNumbers)) fail('EVAL_LEDGER');
  }
  for (const [index, entry] of ledger.requests.entries()) {
    const run = ledger.runs.find(item => item.id === entry.runId);
    if (!run || entry.requestNumber !== BASELINE.requestsStarted + index + 1 || entry.model !== run.model
      || entry.reasoningEffort !== 'max' || entry.maxOutputTokens !== LIMITS.maxOutputTokens
      || !Number.isSafeInteger(entry.requestBytes) || entry.requestBytes < 1 || entry.requestBytes > LIMITS.maxRequestBytes
      || !Number.isFinite(entry.reserveUsd) || entry.reserveUsd <= 0 || !Number.isFinite(entry.accountedUsd) || entry.accountedUsd < 0) fail('EVAL_LEDGER');
    const reserve = roundUp(((entry.requestBytes + 2048) * RATES[entry.model].input + LIMITS.maxOutputTokens * RATES[entry.model].output) / 1e6);
    if (entry.reserveUsd !== reserve) fail('EVAL_LEDGER');
    if (entry.status === 'completed-usage-reported') {
      if (!entry.usage || entry.accountedUsd !== actualCost(entry.model, entry.usage.inputTokens, entry.usage.outputTokens)) fail('EVAL_LEDGER');
    } else if (!['reserved-outcome-unknown', 'response-received-charge-reserved'].includes(entry.status) || entry.accountedUsd !== entry.reserveUsd) fail('EVAL_LEDGER');
  }
  return costs(ledger);
}
export function requestAllowance(ledger, runId, details) {
  const before = validatePolicy(ledger);
  if (ledger.halted) fail('EVAL_EXPERIMENT_HALTED');
  const run = ledger.runs.find(item => item.id === runId);
  if (!run || run.status !== 'started' || details.model !== run.model || details.reasoningEffort !== 'max'
    || details.maxOutputTokens !== LIMITS.maxOutputTokens || !Number.isSafeInteger(details.requestBytes)
    || details.requestBytes < 1 || details.requestBytes > LIMITS.maxRequestBytes) fail('EVAL_SCOPE_CHANGED');
  if (ledger.requests.some(item => item.status !== 'completed-usage-reported')) fail('EVAL_UNKNOWN_OUTCOME');
  if (run.requestNumbers.length >= LIMITS.maxRequestsPerRun || ledger.requests.length >= LIMITS.maxNewRequests) fail('EVAL_REQUEST_LIMIT');
  const reserveUsd = roundUp(((details.requestBytes + 2048) * RATES[run.model].input + LIMITS.maxOutputTokens * RATES[run.model].output) / 1e6);
  if (roundUp(before.phaseUsd + reserveUsd) > LIMITS.maxPhaseSpendUsd || roundUp(before.cumulativeUsd + reserveUsd) > LIMITS.maxTotalSpendUsd) fail('EVAL_SPEND_LIMIT');
  return { reserveUsd, ...before };
}
export function reserveRequest(ledger, runId, details) {
  const allowance = requestAllowance(ledger, runId, details); const next = structuredClone(ledger);
  const requestNumber = ++next.totalRequestsStarted;
  next.requests.push({ requestNumber, runId, model: details.model, reasoningEffort: 'max', maxOutputTokens: LIMITS.maxOutputTokens,
    requestBytes: details.requestBytes, turn: details.turn, startedAt: new Date().toISOString(), status: 'reserved-outcome-unknown',
    reserveUsd: allowance.reserveUsd, accountedUsd: allowance.reserveUsd, usage: null, diagnosticFile: null });
  next.runs.find(run => run.id === runId).requestNumbers.push(requestNumber); validatePolicy(next); return next;
}
export function settleRequest(ledger, requestNumber, request) {
  validatePolicy(ledger); const next = structuredClone(ledger); const entry = next.requests.find(item => item.requestNumber === requestNumber);
  if (!entry || entry.status !== 'reserved-outcome-unknown') fail('EVAL_DIAGNOSTICS');
  // Missing/partial/unknown outcomes retain their entire reserve, including cached tokens.
  entry.status = 'response-received-charge-reserved';
  entry.providerStatus = ['completed', 'incomplete', 'failed'].includes(request?.status) ? request.status : 'unknown';
  entry.completedAt = new Date().toISOString();
  const identityValid = request?.model === entry.model && request?.reasoningEffort === 'max' && request?.maxOutputTokens === LIMITS.maxOutputTokens;
  const usageValid = integer(request?.inputTokens) && integer(request?.outputTokens)
    && (request?.reasoningTokens === null || request?.reasoningTokens === undefined || (integer(request.reasoningTokens) && request.reasoningTokens <= request.outputTokens));
  let stopCode = !identityValid ? 'EVAL_SCOPE_CHANGED' : !usageValid || request.status !== 'completed' ? 'EVAL_USAGE' : null;
  if (identityValid && usageValid && request.status === 'completed') {
    entry.usage = { inputTokens: request.inputTokens, outputTokens: request.outputTokens, reasoningTokens: request.reasoningTokens ?? null };
    entry.accountedUsd = actualCost(entry.model, request.inputTokens, request.outputTokens); entry.status = 'completed-usage-reported';
    if (entry.accountedUsd > entry.reserveUsd || request.outputTokens > LIMITS.maxOutputTokens) stopCode = 'EVAL_RESERVE_EXCEEDED';
  }
  const after = validatePolicy(next);
  if (after.phaseUsd > LIMITS.maxPhaseSpendUsd || after.cumulativeUsd > LIMITS.maxTotalSpendUsd) stopCode = 'EVAL_SPEND_LIMIT';
  return { ledger: next, stopCode };
}
