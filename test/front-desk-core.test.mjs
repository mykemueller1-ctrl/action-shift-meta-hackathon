import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrontDeskDemo } from '../src/front-desk.mjs';

function proposed(store) {
  const request = store.getCase('workplace').request;
  return { ...request, windows: request.windows.map(({ responsibleRole, ...window }) => window) };
}
function mockedRecord(store) {
  return { recorded: true, liveVerified: true, caseId: 'workplace', input: { restaurantId: 'demo-north' }, result: { proposal: proposed(store) },
    receipt: { model: 'muse-spark-1.3', transport: 'live', referenceChecksPassed: true, requests: [{ id: 'resp_synthetic_test_only' }] } };
}

test('client provenance never becomes verified model provenance or a commitment', () => {
  const store = createFrontDeskDemo();
  const result = store.action({ caseId: 'workplace', expectedVersion: 1, action: 'apply_request_proposal', payload: {
    proposal: proposed(store), operator: 'Demo operator', provenance: { mode: 'recorded-meta', responseId: 'resp_fictional_client_claim' },
  } }).case;
  assert.equal(result.proposalSource.sourceVerified, false);
  assert.equal(result.quote, null); assert.equal(result.approval, null); assert.equal(result.commitment, null);
  assert.equal(result.quantityCheck.matches, false);
  assert.equal(result.request.headlineQuantity, 12);
  assert.equal(result.requestVersion, 2);
  assert.equal(result.history[0].before.request.headlineQuantity, 12);
  assert.equal(result.history[0].proposalSource.sourceVerified, false);
  assert.equal(result.paymentStatus, 'unknown');
});

test('server-bound recorded adoption requires correct case, restaurant and recorded live provenance', () => {
  const store = createFrontDeskDemo();
  const record = mockedRecord(store);
  const command = { caseId: 'workplace', expectedVersion: 1, reviewId: 'test-review', operator: 'Demo operator' };
  for (const change of [
    value => { value.recorded = false; }, value => { value.liveVerified = false; },
    value => { value.receipt.transport = 'mocked'; }, value => { value.caseId = 'direct'; },
    value => { value.input.restaurantId = 'demo-south'; }, value => { value.result.proposal = null; },
    value => { value.receipt.requests = []; },
  ]) {
    const invalid = structuredClone(record); change(invalid);
    assert.throws(() => store.applyRecordedProposal(command, invalid));
    assert.equal(store.getCase('workplace').version, 1);
  }
  const result = store.applyRecordedProposal(command, record).case;
  assert.equal(result.proposalSource.sourceVerified, true);
  assert.match(result.proposalSource.verification, /not independent provider attestation/);
  assert.equal(result.proposalSource.reference.responseId, 'resp_synthetic_test_only');
  assert.equal(result.quote, null); assert.equal(result.approval, null); assert.equal(result.receipts.length, 0);
  assert.equal(result.quantityCheck.matches, false);
  assert.throws(() => store.applyRecordedProposal(command, record), error => error.status === 409);
});

test('invalid calendar dates and missing quote windows fail as bounded input errors', () => {
  const store = createFrontDeskDemo();
  for (const date of ['2026-02-31', '2026-13-01', 'today']) assert.throws(() => store.lookupFacts({ date }), error => error.code === 'FRONT_DESK_INPUT');
  const request = store.getCase('workplace').request; delete request.windows;
  assert.throws(() => store.calculateQuote({ date: request.date, request }), error => error.code === 'FRONT_DESK_INPUT');
});

test('a missing headline still yields a useful sum but blocks quote and incomplete proposal adoption', () => {
  const store = createFrontDeskDemo();
  const request = store.getCase('workplace').request; request.headlineQuantity = null;
  const quantities = store.checkQuantities(request);
  assert.equal(quantities.computedQuantity, 13); assert.equal(quantities.matches, false);
  assert.ok(quantities.issues.some(issue => issue.code === 'QUANTITY_MISSING'));
  const quote = store.calculateQuote({ date: request.date, request });
  assert.equal(quote.valid, false); assert.ok(quote.blockers.some(issue => issue.code === 'QUANTITY_MISSING'));
  const proposal = proposed(store); proposal.headlineQuantity = null;
  assert.throws(() => store.action({ caseId: 'workplace', expectedVersion: 1, action: 'apply_request_proposal', payload: { proposal, operator: 'Demo operator' } }));
  assert.equal(store.getCase('workplace').version, 1);
});

test('an authored customer change supports generic window IDs and adds a visible message', () => {
  const store = createFrontDeskDemo();
  const proposal = proposed(store);
  proposal.headlineQuantity = 4; proposal.items = [{ itemId: 'cheese', quantity: 4 }];
  proposal.windows = [{ id: 'early', readyAt: '2026-11-04T12:00:00-06:00', items: [{ itemId: 'cheese', quantity: 2 }] }, { id: 'late', readyAt: '2026-11-04T18:00:00-06:00', items: [{ itemId: 'cheese', quantity: 2 }] }];
  let value = store.action({ caseId: 'workplace', expectedVersion: 1, action: 'apply_request_proposal', payload: { proposal, operator: 'Demo operator' } }).case;
  value = store.action({ caseId: 'workplace', expectedVersion: value.version, action: 'revise_request', payload: { change: 'add_one_garden' } }).case;
  assert.deepEqual(value.request.items, [{ itemId: 'cheese', quantity: 4 }, { itemId: 'garden', quantity: 1 }]);
  assert.equal(value.quantityCheck.matches, true); assert.equal(value.quantityCheck.windowsMatch, true);
  assert.equal(value.messages.at(-1).channel, 'customer-change'); assert.match(value.messages.at(-1).text, /add one garden pizza.*late/);
  value = store.action({ caseId: 'workplace', expectedVersion: value.version, action: 'revise_request', payload: { change: 'move_evening' } }).case;
  assert.equal(value.request.windows[1].readyAt, '2026-11-04T18:30:00-06:00');
  assert.equal(value.request.windows[0].readyAt, '2026-11-04T12:00:00-06:00');
});
