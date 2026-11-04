import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createFrontDeskDemo } from '../src/front-desk.mjs';
import { createFrontDeskServer } from '../src/front-desk-server.mjs';
import { loadFrontDeskRecordings } from '../src/front-desk-recordings.mjs';

const recordings = await loadFrontDeskRecordings();
const read = id => recordings.recordedReviewProvider(id);
const command = (store, caseId, reviewId) => ({ caseId, expectedVersion: store.getCase(caseId).version, reviewId, operator: 'Demo operator' });
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');

test('recorded adoption exposes the exact model source and original proposal while preserving authored messages', async () => {
  const store = createFrontDeskDemo(); const before = store.getCase('workplace'); const review = await read('offer-and-count');
  const result = store.applyRecordedProposal(command(store, 'workplace', 'offer-and-count'), review).case;
  assert.deepEqual(result.messages.slice(0, before.messages.length), before.messages);
  const source = result.messages.at(-1);
  assert.equal(source.channel, 'model-reviewed-source'); assert.equal(source.text, review.input.message);
  assert.match(source.text, /At noon send 3 cheese, 2 pepper and 1 garden/);
  assert.equal(source.reviewId, 'offer-and-count'); assert.equal(source.responseId, review.receipt.requests.at(-1).id);
  assert.equal(source.sourceMessageSha256, digest(review.input.message)); assert.equal(source.sourceMode, 'recorded-meta');
  assert.deepEqual(result.proposalSource.originalProposal, review.result.proposal);
  assert.equal(result.proposalSource.input.message, review.input.message);
  assert.equal(result.proposalSource.input.synthetic, true); assert.equal(result.proposalSource.sourceVerified, true);
  assert.deepEqual(result.history.at(-1).proposalSource, result.proposalSource);
  assert.equal(result.approval, null); assert.equal(result.quote, null); assert.equal(result.receipts.length, 0);
  result.proposalSource.originalProposal.headlineQuantity = 99;
  assert.equal(store.getCase('workplace').proposalSource.originalProposal.headlineQuantity, 12);
});

test('recorded source identity, synthetic scope, date and optional actual model input must agree before adoption', async () => {
  const review = await read('offer-and-count'); const store = createFrontDeskDemo();
  const before = store.getCase('workplace');
  for (const modify of [
    record => { record.input.synthetic = false; }, record => { record.input.restaurantId = 'demo-south'; },
    record => { record.input.demoNow = '2026-11-05T10:00:00-06:00'; }, record => { record.input.scenarioId = 'other-review'; },
    record => { record.scenarioId = 'other-review'; }, record => { record.input.message = ''; },
    record => { record.input.message = 'x'.repeat(5001); }, record => { record.input.privateData = true; },
    record => { record.modelInput = { synthetic: true, restaurantId: 'demo-north', demoNow: record.input.demoNow, message: 'A different input.' }; },
  ]) {
    const invalid = structuredClone(review); modify(invalid);
    assert.throws(() => store.applyRecordedProposal(command(store, 'workplace', 'offer-and-count'), invalid));
    assert.deepEqual(store.getCase('workplace'), before);
  }
  const valid = structuredClone(review); const { synthetic, restaurantId, demoNow, message } = valid.input;
  valid.modelInput = { synthetic, restaurantId, demoNow, message };
  assert.equal(store.applyRecordedProposal(command(store, 'workplace', 'offer-and-count'), valid).case.proposalSource.sourceVerified, true);
});

test('operator reply correction preserves the unsupported original wording and stays an unsent draft', async () => {
  const store = createFrontDeskDemo(); const review = await read('recovery-no-call'); const before = store.getCase('recovery');
  const edited = 'I am sorry your meal was cold. A person needs to review the offered credit and reply here. We will respect your request not to call.';
  const result = store.reviewRecordedReply({ ...command(store, 'recovery', 'recovery-no-call'), text: edited }, review).case;
  assert.match(result.reviewedReply.originalReply, /I've flagged this/);
  assert.equal(result.reviewedReply.originalReply, review.result.reply); assert.equal(result.reviewedReply.text, edited);
  assert.equal(result.reviewedReply.status, 'reviewed-unsent'); assert.equal(result.reviewedReply.sent, false);
  assert.equal(result.reviewedReply.operator, 'Demo operator'); assert.ok(Number.isFinite(Date.parse(result.reviewedReply.reviewedAt)));
  assert.equal(result.reviewedReply.responseId, review.receipt.requests.at(-1).id);
  assert.equal(result.reviewedReply.sourceMessageSha256, digest(review.input.message));
  assert.deepEqual(result.history.at(-1).replyReview, result.reviewedReply); assert.equal(result.history.at(-1).previousReplyReview, null);
  assert.deepEqual(result.request, before.request); assert.deepEqual(result.recovery, before.recovery);
  assert.equal(result.status, before.status); assert.equal(result.requestVersion, before.requestVersion); assert.equal(result.version, before.version + 1);
  assert.equal(result.receipts.length, 0); assert.equal(result.approval, null); assert.equal(result.paymentStatus, 'unknown');
  assert.deepEqual(result.messages, before.messages); // An unsent draft never impersonates a delivered customer message.
  assert.equal(store.getStatus().correctionStorage.count, 0);
  assert.equal(createFrontDeskDemo().getCase('recovery').reviewedReply, null);
});

test('successive reply edits keep original model wording and each previous operator draft in audit history', async () => {
  const store = createFrontDeskDemo(); const review = await read('recovery-no-call');
  const first = store.reviewRecordedReply({ ...command(store, 'recovery', 'recovery-no-call'), text: 'A person needs to review this credit.' }, review).case;
  const second = store.reviewRecordedReply({ ...command(store, 'recovery', 'recovery-no-call'), text: 'A person needs to review this credit and reply here without calling.' }, review).case;
  assert.equal(second.reviewedReply.originalReply, review.result.reply);
  assert.deepEqual(second.history.at(-1).previousReplyReview, first.reviewedReply);
  assert.deepEqual(second.history[0].replyReview, first.reviewedReply);
  assert.equal(second.recovery.noCall, true); assert.equal(second.recovery.issuedCents, null);
});

test('reply editing rejects client provenance, wrong cases, stale versions, markup, hidden controls and oversized input', async () => {
  const store = createFrontDeskDemo(); const review = await read('recovery-no-call');
  const before = store.getCase('recovery');
  assert.throws(() => store.action({ caseId: 'recovery', expectedVersion: 1, action: 'review_recorded_reply', payload: { operator: 'Demo operator', text: 'A fabricated draft source.' } }), error => error.code === 'FRONT_DESK_RECORD');
  for (const text of ['', '  ', '<script>alert(1)</script>', 'x\u202ey', 'x\0y', 'x'.repeat(2501)]) {
    assert.throws(() => store.reviewRecordedReply({ ...command(store, 'recovery', 'recovery-no-call'), text }, review), error => error.code === 'FRONT_DESK_INPUT');
    assert.deepEqual(store.getCase('recovery'), before);
  }
  assert.throws(() => store.reviewRecordedReply({ ...command(store, 'direct', 'recovery-no-call'), text: 'A valid plain draft.' }, review), error => error.code === 'FRONT_DESK_RECORD');
  assert.throws(() => store.reviewRecordedReply({ ...command(store, 'recovery', 'recovery-no-call'), operator: 'Guest', text: 'A valid plain draft.' }, review), error => error.code === 'FRONT_DESK_APPROVAL_REQUIRED');
  const firstCommand = { ...command(store, 'recovery', 'recovery-no-call'), text: 'A person needs to review this credit.' };
  store.reviewRecordedReply(firstCommand, review);
  assert.throws(() => store.reviewRecordedReply(firstCommand, review), error => error.code === 'FRONT_DESK_STALE_VERSION');
});

test('HTTP reply review resolves the configured record and never accepts a client-provided original reply', async () => {
  const port = 65000 + Math.floor(Math.random() * 300); const store = createFrontDeskDemo();
  const server = createFrontDeskServer({ port, store, ...recordings }); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const post = payload => fetch(`http://127.0.0.1:${port}/api/front-desk/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: 'recovery', expectedVersion: 1, action: 'review_recorded_reply', payload }) });
  try {
    const status = await (await fetch(`http://127.0.0.1:${port}/api/front-desk/status`)).json();
    assert.equal(status.capabilities.recordedReplyReview, true);
    const payload = { reviewId: 'recovery-no-call', operator: 'Demo operator', text: 'A person needs to review the credit. We will reply here; no call.' };
    assert.equal((await post({ ...payload, originalReply: 'I already issued the credit.' })).status, 400);
    assert.equal((await post({ ...payload, reviewId: 'unknown' })).status, 400);
    const response = await post(payload); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.case.reviewedReply.sent, false);
    assert.match(result.case.reviewedReply.originalReply, /I've flagged this/); assert.equal(result.case.recovery.noCall, true);
    assert.equal(result.case.recovery.issuedCents, null); assert.equal(result.case.receipts.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
