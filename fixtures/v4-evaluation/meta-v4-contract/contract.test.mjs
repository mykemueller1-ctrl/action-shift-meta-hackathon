// Mock transport and compatibility checks, not empirical model-quality evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { reviewFrontDesk, getCandidateContract, getCandidateContractHashes } from './front-desk-meta.mjs';
import { reviewFrontDesk as baselineReview, getComparisonContract } from './baseline-front-desk-meta.mjs';
import { createFrontDeskDemo } from '../action-shift-v3/src/front-desk.mjs';

const packet = { synthetic: true, scenarioId: 'local-mock-only', restaurantId: 'demo-north', demoNow: '2026-11-04T10:00:00-06:00', message: 'Please review this fictional request.' };
const result = { intent: 'human-review', status: 'human-review', summary: 'The restaurant needs to review this draft.', reply: 'The restaurant will need to review the request.', questions: [], sourceIds: [], proposal: null };
const final = value => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] });
const call = (name, args) => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'mock-call', status: 'completed' });
const envelope = (model, output) => ({ id: 'resp_mock_contract', model, status: 'completed', usage: { input_tokens: 100, output_tokens: 200, output_tokens_details: { reasoning_tokens: 150 } }, output });
function harness(model, outputs = [[final(result)]]) {
  const bodies = [], before = [], turns = []; const store = createFrontDeskDemo();
  return { bodies, before, turns, store, options: { apiKey: 'mock-only-key', model, reasoningEffort: 'max', maxOutputTokens: 12000,
    timeoutMs: 120000, maxRequests: 3, maxToolCalls: 8, lookupFacts: store.lookupFacts, checkQuantities: store.checkQuantities,
    beforeRequest: async value => { before.push(value); }, onTurn: async value => { turns.push(value); },
    fetchImpl: async (url, init) => { assert.equal(url, 'https://api.meta.ai/v1/responses'); assert.equal(before.length, bodies.length + 1, 'Budget callback precedes transport.');
      assert.equal(init.redirect, 'error'); assert.ok(init.signal); bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify(envelope(model, outputs.shift())), { status: 200 }); },
  } };
}
const withoutDescriptions = value => Array.isArray(value) ? value.map(withoutDescriptions) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, item]) => [key, withoutDescriptions(item)])) : value;

test('candidate schemas remain structurally backward-compatible and quantity meaning is shared by tool and proposal', () => {
  const candidate = getCandidateContract(), baseline = getComparisonContract();
  assert.deepEqual(withoutDescriptions(candidate.tools), withoutDescriptions(baseline.tools));
  assert.deepEqual(withoutDescriptions(candidate.schema), withoutDescriptions(baseline.schema));
  assert.equal(candidate.endpoint, baseline.endpoint); assert.equal(candidate.maxRequestBytes, 160000); assert.equal(candidate.maxResponseBytes, 512000);
  const toolDescription = candidate.tools.find(item => item.name === 'check_order_quantities').parameters.properties.headlineQuantity.description;
  assert.equal(candidate.schema.properties.proposal.anyOf[0].properties.headlineQuantity.description, toolDescription);
  assert.match(toolDescription, /version the guest is asking/); assert.match(toolDescription, /even if it disagrees/);
  assert.match(toolDescription, /complete revised item lines follow unambiguously/); assert.match(toolDescription, /label it calculated/);
  assert.match(candidate.instructions, /Never invent missing allocations, times or places/);
  assert.match(candidate.instructions, /not guest consent/);
  const site = candidate.schema.properties.proposal.anyOf[0].properties.destination.description;
  assert.match(site, /currently requested fulfillment mode/); assert.match(site, /venue, employer, prior location or suggested alternative/);
});

test('baseline retains the previous original contract with only max effort allowance and model accounting metadata added', async () => {
  const original = await readFile(new URL('../reasoning-comparison/front-desk-meta.mjs', import.meta.url), 'utf8');
  const current = await readFile(new URL('./baseline-front-desk-meta.mjs', import.meta.url), 'utf8');
  // apply_patch normalizes line endings; executable text is otherwise byte-for-byte equivalent.
  assert.equal(current.replace("['low','high','max'].includes(reasoningEffort)", "['low','high'].includes(reasoningEffort)")
    .replace('const request={id:raw.id,model:MODEL,reasoningEffort', 'const request={id:raw.id,reasoningEffort').replaceAll('\r\n', '\n'), original.replaceAll('\r\n', '\n'));
});

test('candidate model arms send the identical contract and expose actual max/cap/model to budget and receipts', async () => {
  const bodies = [];
  for (const model of ['muse-spark-1.3', 'muse-wonder-1.0']) {
    const h = harness(model); const review = await reviewFrontDesk(packet, h.options); bodies.push(h.bodies[0]);
    assert.equal(h.bodies[0].model, model); assert.equal(h.bodies[0].reasoning.effort, 'max'); assert.equal(h.bodies[0].max_output_tokens, 12000);
    assert.equal(h.before[0].model, model); assert.equal(h.before[0].reasoningEffort, 'max'); assert.equal(h.before[0].maxOutputTokens, 12000);
    assert.equal(h.turns[0].request.model, model); assert.equal(review.receipt.model, model); assert.equal(review.receipt.reasoningEffort, 'max'); assert.equal(review.receipt.maxOutputTokens, 12000);
    assert.equal(review.receipt.requests[0].model, model); assert.equal(review.liveVerified, false); assert.equal(review.receipt.transport, 'mocked');
    assert.deepEqual(Object.keys(JSON.parse(h.bodies[0].input[0].content[0].text)).sort(), ['demoNow', 'message', 'restaurantId', 'synthetic']);
    assert.ok(!JSON.stringify(h.bodies).includes(packet.scenarioId)); assert.ok(!JSON.stringify({ before: h.before, turns: h.turns, review }).includes('mock-only-key'));
  }
  assert.deepEqual({ ...bodies[0], model: null }, { ...bodies[1], model: null });
  const baseline = harness('muse-spark-1.3'); const review = await baselineReview(packet, baseline.options);
  assert.equal(baseline.bodies[0].reasoning.effort, 'max'); assert.equal(baseline.bodies[0].max_output_tokens, 12000); assert.equal(review.receipt.model, 'muse-spark-1.3');
  assert.equal(baseline.turns[0].request.model, 'muse-spark-1.3');
});

test('candidate rejects unsupported model/effort/cap before transport and mismatched returned identity without fallback', async () => {
  for (const invalid of [{ model: 'latest' }, { model: 'muse-wonder-full' }, { reasoningEffort: 'high' }, { reasoningEffort: 'low' }, { maxOutputTokens: 5000 }]) {
    const h = harness('muse-spark-1.3'); await assert.rejects(reviewFrontDesk(packet, { ...h.options, ...invalid }), { code: 'FRONT_DESK_CONFIGURATION' }); assert.equal(h.bodies.length, 0);
  }
  for (const [requested, returned] of [['muse-spark-1.3', 'muse-wonder-1.0'], ['muse-wonder-1.0', 'muse-spark-1.3']]) {
    const h = harness(requested); let requests = 0;
    await assert.rejects(reviewFrontDesk(packet, { ...h.options, fetchImpl: async () => { requests += 1; return new Response(JSON.stringify(envelope(returned, [final(result)]))); } }), { code: 'FRONT_DESK_PROTOCOL' });
    assert.equal(requests, 1); assert.equal(h.turns.length, 0);
  }
});

test('runtime preserves a current stated mismatch, unknown site and incomplete allocation instead of repairing model output', async () => {
  const proposal = { kind: 'food', date: '2026-11-04', fulfillment: 'delivery', headlineQuantity: 4,
    items: [{ itemId: 'cheese', quantity: 3 }], windows: [{ id: 'later', readyAt: null, items: [] }], destination: null };
  const output = { ...result, intent: 'direct-order', status: 'needs-clarification', proposal, questions: ['Which total is current, and what time and drop-off point do you need?'] };
  const h = harness('muse-wonder-1.0', [[call('check_order_quantities', { headlineQuantity: 4, items: proposal.items, windows: [] })], [final(output)]]);
  const before = h.store.getCase('direct'); const review = await reviewFrontDesk(packet, h.options);
  assert.equal(review.tools[0].result.statedQuantity, 4); assert.equal(review.tools[0].result.computedQuantity, 3); assert.equal(review.tools[0].result.matches, false);
  assert.deepEqual(review.result, output); assert.deepEqual(h.store.getCase('direct'), before);
  assert.throws(() => h.store.action({ caseId: 'direct', expectedVersion: before.version, action: 'apply_request_proposal', payload: { operator: 'Demo operator', proposal: review.result.proposal } }), error => error.code === 'FRONT_DESK_INPUT');
});

test('a mocked complete derived proposal remains an unapproved draft and arithmetic is not source accuracy proof', async () => {
  const proposal = { kind: 'food', date: '2026-11-04', fulfillment: 'pickup', headlineQuantity: 3,
    items: [{ itemId: 'cheese', quantity: 3 }], windows: [{ id: 'later', readyAt: '2026-11-04T14:00:00-06:00', items: [{ itemId: 'cheese', quantity: 3 }] }], destination: 'Explicit fictional collection counter' };
  const output = { ...result, intent: 'direct-order', status: 'ready-for-operator', summary: 'The revised count is calculated as three from the revised lines.', proposal };
  const h = harness('muse-spark-1.3', [[call('check_order_quantities', { headlineQuantity: 3, items: proposal.items, windows: proposal.windows.map(({ readyAt, ...window }) => window) })], [final(output)]]);
  const review = await reviewFrontDesk(packet, h.options);
  assert.equal(review.tools[0].result.matches, true); assert.equal(review.tools[0].result.windowsMatch, true); assert.equal(review.receipt.semanticReviewRequired, true);
  const adopted = h.store.action({ caseId: 'direct', expectedVersion: h.store.getCase('direct').version, action: 'apply_request_proposal', payload: { operator: 'Demo operator', proposal: review.result.proposal } }).case;
  assert.equal(adopted.quote, null); assert.equal(adopted.approval, null); assert.equal(adopted.receipts.length, 0); assert.equal(adopted.proposalSource.sourceVerified, false);
});

test('frozen contract hash export is deterministic, model-independent and unaffected by editing returned copies', () => {
  const before = getCandidateContractHashes(); const contract = getCandidateContract();
  assert.equal(before.completeContractSha256, createHash('sha256').update(JSON.stringify(contract)).digest('hex'));
  contract.schema.properties.proposal.anyOf[0].properties.destination.description = 'Changed outside the adapter';
  contract.tools.length = 0; contract.instructions = 'Changed';
  assert.deepEqual(getCandidateContractHashes(), before);
});
