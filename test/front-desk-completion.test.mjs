import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createFrontDeskDemo } from '../src/front-desk.mjs';
import { createFrontDeskServer } from '../src/front-desk-server.mjs';
import { loadFrontDeskRecordings } from '../src/front-desk-recordings.mjs';

const recordings = await loadFrontDeskRecordings();
const record = () => recordings.recordedReviewProvider('fresh-01');
const command = (store, changes = { destination: 'Maple Street Kitchen' }) => ({ caseId: 'workplace', expectedVersion: store.getCase('workplace').version,
  reviewId: 'fresh-01', operator: 'Demo operator', changes, reason: 'I checked the guest source, which explicitly names this pickup location.' });
const act = (store, action, payload = {}) => store.action({ caseId: 'workplace', expectedVersion: store.getCase('workplace').version, action, payload }).case;

test('failed recording remains immutable and visibly failed while operator completion creates only an audited draft', async () => {
  const rawBytes = await readFile(new URL('../fixtures/reasoning-comparison/run-01.json', import.meta.url));
  const raw = JSON.parse(rawBytes); const review = await record(); const saved = structuredClone(review);
  assert.equal(createHash('sha256').update(rawBytes).digest('hex'), recordings.humanReviewManifest.sha256);
  assert.equal(review.evaluation.semanticReviewStatus, 'pending'); assert.equal(review.replayReview.semanticVerdict, 'fail');
  assert.deepEqual(review.result, raw.result); assert.deepEqual(review.modelInput, raw.modelInput);
  const store = createFrontDeskDemo(); const before = store.getCase('workplace');
  const result = store.completeRecordedProposal(command(store), review).case;
  assert.deepEqual(review, saved); assert.equal(result.request.destination, 'Maple Street Kitchen');
  assert.equal(result.request.headlineQuantity, 12); assert.equal(result.request.date, '2026-11-08');
  assert.equal(result.quote, null); assert.equal(result.approval, null); assert.deepEqual(result.receipts, []);
  assert.equal(result.requestVersion, before.requestVersion + 1);
  assert.deepEqual(result.proposalSource.originalProposal, raw.result.proposal);
  assert.deepEqual(result.proposalSource.originalResult, raw.result);
  assert.equal(result.proposalSource.originalResultSha256, createHash('sha256').update(JSON.stringify(raw.result)).digest('hex'));
  assert.equal(result.proposalSource.kind, 'operator-completed');
  assert.deepEqual(result.proposalSource.operatorCompletion.changes, [{ field: 'destination', before: null, after: 'Maple Street Kitchen' }]);
  assert.equal(result.proposalSource.operatorCompletion.operator, 'Demo operator');
  assert.equal(result.proposalSource.operatorCompletion.reason, command(store).reason);
  assert.equal(result.proposalSource.operatorCompletion.approved, false);
  assert.equal(result.messages.at(-1).text, raw.modelInput.message);
  assert.equal(result.history.at(-1).action, 'complete_recorded_proposal');
  assert.deepEqual(result.history.at(-1).proposalSource, result.proposalSource);
  assert.equal(act(store, 'prepare_quote').quote.totalCents, 19800);
});

test('completion rejects extra edits, absent review, changed non-null fields, wrong scope and stale versions atomically', async () => {
  const base = await record(); const store = createFrontDeskDemo(); const before = store.getCase('workplace');
  const attempts = [
    [command(store, {}), base], [command(store, { headlineQuantity: 12 }), base],
    [command(store, { destination: 'Maple Street Kitchen', windows: [] }), base],
    [command(store, { destination: '' }), base], [command(store, { destination: '<script>' }), base],
    [{ ...command(store), reason: '' }, base], [{ ...command(store), operator: 'Myke' }, base],
    [{ ...command(store), expectedVersion: 0 }, base], [{ ...command(store), caseId: 'direct' }, base],
    [command(store), { ...base, recorded: false }],
    [command(store), { ...base, result: { ...base.result, proposal: { ...base.result.proposal, fulfillment: 'delivery' } } }],
    [command(store), { ...base, result: { ...base.result, proposal: { ...base.result.proposal, fulfillment: null } } }],
    [command(store), { ...base, result: { ...base.result, proposal: { ...base.result.proposal, destination: 'Already known' } } }],
  ];
  for (const [input, review] of attempts) {
    assert.throws(() => store.completeRecordedProposal(input, review), error => /^FRONT_DESK_/.test(error.code));
    assert.deepEqual(store.getCase('workplace'), before);
  }
  assert.throws(() => act(store, 'complete_recorded_proposal', command(store)), error => error.code === 'FRONT_DESK_ACTION');
});

test('operator must enter a missing final total, and unknown per-window allocations remain blocked', async () => {
  const base = await record(); const store = createFrontDeskDemo();
  const review = structuredClone(base); review.result.proposal.headlineQuantity = null;
  assert.throws(() => store.completeRecordedProposal(command(store, { destination: 'Maple Street Kitchen', headlineQuantity: 11 }), review), error => error.code === 'FRONT_DESK_QUANTITY');
  assert.equal(store.getCase('workplace').version, 1);
  const incomplete = structuredClone(review); incomplete.result.proposal.windows[0].items = [];
  assert.throws(() => store.completeRecordedProposal(command(store, { destination: 'Maple Street Kitchen', headlineQuantity: 12 }), incomplete), error => error.code === 'FRONT_DESK_INPUT');
  assert.equal(store.getCase('workplace').version, 1);
  const completed = store.completeRecordedProposal(command(store, { destination: 'Maple Street Kitchen', headlineQuantity: 12 }), review).case;
  assert.equal(completed.proposalSource.originalProposal.headlineQuantity, null);
  assert.equal(completed.proposalSource.operatorCompletion.changes.length, 2);
  assert.equal(completed.request.headlineQuantity, 12); assert.equal(completed.approval, null);
});

test('completion invalidates prior approval but preserves the prior kitchen commitment and receipt history', async () => {
  const store = createFrontDeskDemo(); act(store, 'clarify_quantity', { quantity: 13 });
  let current = act(store, 'prepare_quote'); current = act(store, 'approve_quote', { requestVersion: current.requestVersion, quoteId: current.quote.id, operator: 'Demo operator', priceAccepted: true, timingAccepted: true, capacityAccepted: true });
  current = act(store, 'acknowledge_kitchen', { requestVersion: current.requestVersion, quoteId: current.quote.id });
  const receipts = structuredClone(current.receipts); const prior = current.commitment.requestVersion;
  const next = store.completeRecordedProposal(command(store), await record()).case;
  assert.equal(next.quote, null); assert.equal(next.approval, null); assert.deepEqual(next.kitchenPulls, []);
  assert.deepEqual(next.receipts, receipts); assert.equal(next.commitment.requestVersion, prior); assert.equal(next.commitment.status, 'change_pending');
});

test('HTTP completion resolves the trusted saved record and rejects replacement proposals or replayed stale commands', async () => {
  const port = 60000 + Math.floor(Math.random() * 1000); const store = createFrontDeskDemo();
  const server = createFrontDeskServer({ port, store, ...recordings }); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${port}/api/front-desk`;
  const input = command(store); const { caseId, expectedVersion, ...payload } = input;
  const post = p => fetch(`${base}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId, expectedVersion, action: 'complete_recorded_proposal', payload: p }) });
  try {
    assert.equal((await (await fetch(`${base}/status`)).json()).capabilities.recordedProposalCompletion, true);
    assert.equal((await post({ ...payload, proposal: (await record()).result.proposal })).status, 400);
    assert.equal((await post({ ...payload, reviewId: 'not-configured' })).status, 400);
    const response = await post(payload); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.case.proposalSource.originalProposal.destination, null);
    assert.equal((await post(payload)).status, 409);
    assert.equal((await (await fetch(`${base}/recorded?id=fresh-01`)).json()).result.proposal.destination, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
