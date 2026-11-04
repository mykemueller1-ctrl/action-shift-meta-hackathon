import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrontDeskDemo } from '../src/front-desk.mjs';
import { reviewFrontDesk, FRONT_DESK_TOOLS } from '../src/front-desk-meta.mjs';

// Independent behavioral checks. All cases and values below are synthetic.
// No private restaurant evidence, model API or external transaction is used.
const caseIds = ['workplace', 'direct', 'reservation', 'recovery'];
const snapshot = demo => caseIds.map(id => demo.getCase(id));
const command = (demo, caseId, action, payload = {}) => demo.action({
  caseId,
  expectedVersion: demo.getCase(caseId).version,
  action,
  payload,
});

function rejectWithoutChangingCases(demo, run) {
  const before = snapshot(demo);
  assert.throws(run, 'The invalid commitment must be rejected.');
  assert.deepEqual(snapshot(demo), before, 'A rejected command must leave every case unchanged.');
}

function quotedWorkplace(demo) {
  command(demo, 'workplace', 'clarify_quantity', { quantity: 13 });
  command(demo, 'workplace', 'prepare_quote');
  return demo.getCase('workplace');
}

function approve(demo, caseId = 'workplace') {
  const current = demo.getCase(caseId);
  return command(demo, caseId, 'approve_quote', {
    requestVersion: current.requestVersion, quoteId: current.quote.id,
    priceAccepted: true, timingAccepted: true, capacityAccepted: true,
    operator: 'Demo operator',
  });
}

function acknowledge(demo, caseId = 'workplace') {
  const current = demo.getCase(caseId);
  return command(demo, caseId, 'acknowledge_kitchen', {
    requestVersion: current.requestVersion, quoteId: current.quote.id,
  });
}

const proposalFromRequest = request => ({
  kind: request.kind, date: request.date, fulfillment: request.fulfillment,
  headlineQuantity: request.headlineQuantity, items: structuredClone(request.items),
  windows: request.windows.map(({ id, readyAt, items }) => ({ id, readyAt, items: structuredClone(items) })),
  destination: request.destination,
});

test('reading or editing a returned case cannot change the stored restaurant case', () => {
  const demo = createFrontDeskDemo();
  const before = snapshot(demo);
  const customerCopy = demo.getCase('workplace');
  customerCopy.version = 999;
  customerCopy.request = { quantity: 1, status: 'paid' };
  customerCopy.approval = { approved: true };
  customerCopy.receipts = [{ status: 'fulfilled' }];
  assert.deepEqual(snapshot(demo), before);
});

test('a quantity disagreement cannot advance straight to a quote or kitchen commitment', () => {
  const demo = createFrontDeskDemo();
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'prepare_quote'));
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'acknowledge_kitchen', {
    requestVersion: demo.getCase('workplace').requestVersion,
    quoteId: 'synthetic-unapproved-quote',
  }));
});

test('case-specific actions cannot mutate unrelated kinds of restaurant work', () => {
  const demo = createFrontDeskDemo();
  for (const [caseId, action, payload] of [
    ['reservation', 'acknowledge_kitchen', { requestVersion: 1, quoteId: 'synthetic-quote' }],
    ['workplace', 'issue_remedy', {}],
    ['recovery', 'approve_reservation', { requestVersion: 1, capacityAccepted: true, timingAccepted: true, operator: 'Demo operator' }],
    ['direct', 'authorize_remedy', { operator: 'Demo operator' }],
  ]) {
    rejectWithoutChangingCases(demo, () => command(demo, caseId, action, payload));
  }
});

test('a stale browser version cannot overwrite a more recent customer clarification', () => {
  const demo = createFrontDeskDemo();
  const staleVersion = demo.getCase('workplace').version;
  command(demo, 'workplace', 'clarify_quantity', { quantity: 13 });
  rejectWithoutChangingCases(demo, () => demo.action({
    caseId: 'workplace', expectedVersion: staleVersion,
    action: 'clarify_quantity', payload: { quantity: 12 },
  }));
});

test('a model-shaped command cannot claim paid or fulfilled state through the action boundary', () => {
  const demo = createFrontDeskDemo();
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'model_proposal', {
    status: 'fulfilled', paid: true, approval: true,
    receipt: { kind: 'real-kitchen', confirmed: true },
  }));
});

test('an authored revision cannot silently resolve the original disputed quantity', () => {
  const demo = createFrontDeskDemo();
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'revise_request', { change: 'add_one_garden' }));
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'revise_request', { change: 'move_evening' }));
});

test('quote and each kitchen pull reconcile by item as well as by total using exact cents', () => {
  const demo = createFrontDeskDemo();
  const quoted = quotedWorkplace(demo);
  assert.equal(quoted.quantityCheck.computedQuantity, 13);
  assert.equal(quoted.quote.totalCents, 21_300);
  assert.deepEqual(quoted.quote.items.map(item => [item.itemId, item.quantity, item.unitPriceCents, item.lineTotalCents]), [
    ['cheese', 6, 1500, 9000], ['pepper', 4, 1800, 7200], ['garden', 3, 1700, 5100],
  ]);
  assert.equal(quoted.approval, null);
  assert.deepEqual(quoted.kitchenPulls, []);
  approve(demo);
  assert.deepEqual(demo.getCase('workplace').receipts, [], 'Approval alone is not kitchen acceptance.');
  acknowledge(demo);
  const accepted = demo.getCase('workplace');
  assert.equal(accepted.kitchenPulls.length, 2);
  assert.deepEqual(accepted.kitchenPulls.map(pull => pull.quantity), [6, 7]);
  for (const line of accepted.quote.items) {
    const allocated = accepted.kitchenPulls.flatMap(pull => pull.items).filter(item => item.itemId === line.itemId).reduce((sum, item) => sum + item.quantity, 0);
    assert.equal(allocated, line.quantity);
  }
  for (const pull of accepted.kitchenPulls) {
    const receipt = accepted.receipts.find(item => item.pullId === pull.id);
    assert.ok(receipt);
    assert.equal(receipt.requestVersion, accepted.requestVersion);
    assert.equal(receipt.quoteId, accepted.quote.id);
    assert.equal(receipt.approvalId, accepted.approval.id);
    assert.equal(receipt.requestHash, accepted.quote.requestHash);
    assert.equal(receipt.quantity, pull.quantity);
    assert.equal(receipt.simulated, true);
  }
  assert.equal(accepted.paymentStatus, 'unknown');
  assert.equal(accepted.fulfillmentStatus, 'unknown');
});

test('equal aggregate window counts cannot conceal the wrong food allocation', () => {
  const demo = createFrontDeskDemo();
  const request = demo.getCase('workplace').request;
  request.headlineQuantity = 13;
  request.windows[0].items.find(item => item.itemId === 'cheese').quantity += 1;
  request.windows[0].items.find(item => item.itemId === 'garden').quantity -= 1;
  request.windows[0].items = request.windows[0].items.filter(item => item.quantity > 0);
  const check = demo.checkQuantities(request);
  assert.equal(check.windowsTotal, 13);
  assert.equal(check.matches, true);
  assert.equal(check.windowsMatch, false);
  assert.equal(demo.calculateQuote({ restaurantId: 'demo-north', date: request.date, request }).valid, false);
});

test('negative, fractional and unsafe quantities cannot enter a price calculation', () => {
  const demo = createFrontDeskDemo();
  for (const quantity of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    const request = demo.getCase('direct').request;
    request.headlineQuantity = quantity;
    request.items[0].quantity = quantity;
    request.windows[0].items[0].quantity = quantity;
    assert.throws(() => demo.calculateQuote({ restaurantId: 'demo-north', date: request.date, request }));
  }
});

test('request-supplied price claims cannot replace the current approved menu cents', () => {
  const demo = createFrontDeskDemo();
  const request = demo.getCase('direct').request;
  request.items[0].unitPriceCents = 1;
  request.items[0].lineTotalCents = 2;
  request.totalCents = 2;
  const quote = demo.calculateQuote({ restaurantId: 'demo-north', date: request.date, request });
  assert.equal(quote.valid, true);
  assert.equal(quote.totalCents, 3000);
  assert.equal(quote.items[0].unitPriceCents, 1500);
});

test('approval requires the current quote plus separate price, timing and capacity decisions', () => {
  const demo = createFrontDeskDemo();
  const quoted = quotedWorkplace(demo);
  const consent = { requestVersion: quoted.requestVersion, quoteId: quoted.quote.id, priceAccepted: true, timingAccepted: true, capacityAccepted: true, operator: 'Demo operator' };
  for (const changed of [
    { quoteId: 'synthetic-wrong-quote' }, { requestVersion: quoted.requestVersion - 1 },
    { priceAccepted: false }, { timingAccepted: false }, { capacityAccepted: false }, { operator: 'Model' },
  ]) rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'approve_quote', { ...consent, ...changed }));
  rejectWithoutChangingCases(demo, () => acknowledge(demo));
  approve(demo);
  rejectWithoutChangingCases(demo, () => approve(demo));
});

test('a change preserves the prior commitment but rejects stale approval and kitchen acknowledgment', () => {
  const demo = createFrontDeskDemo();
  quotedWorkplace(demo); approve(demo); acknowledge(demo);
  const old = demo.getCase('workplace');
  command(demo, 'workplace', 'revise_request', { change: 'add_one_garden' });
  const changed = demo.getCase('workplace');
  assert.equal(changed.requestVersion, old.requestVersion + 1);
  assert.equal(changed.approval, null);
  assert.equal(changed.quote, null);
  assert.deepEqual(changed.kitchenPulls, []);
  assert.deepEqual(changed.receipts, old.receipts);
  assert.deepEqual(changed.commitment.request, old.request);
  assert.equal(changed.commitment.status, 'change_pending');
  command(demo, 'workplace', 'prepare_quote');
  for (const payload of [
    { requestVersion: old.requestVersion, quoteId: old.quote.id },
    { requestVersion: demo.getCase('workplace').requestVersion, quoteId: old.quote.id },
  ]) rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'acknowledge_kitchen', payload));
  approve(demo); acknowledge(demo);
  const updated = demo.getCase('workplace');
  assert.equal(updated.quote.totalCents, 23_000);
  assert.deepEqual(updated.kitchenPulls.map(pull => pull.quantity), [6, 8]);
  assert.equal(updated.receipts.length, 4);
  assert.notEqual(updated.quote.id, old.quote.id);
  assert.equal(updated.commitment.requestVersion, updated.requestVersion);
});

test('an operator correction affects only the intended restaurant/date and does not silently change delivery', () => {
  const demo = createFrontDeskDemo();
  const unrelatedBefore = ['reservation', 'recovery'].map(id => demo.getCase(id));
  command(demo, 'workplace', 'correct_pickup_only', { operator: 'Demo operator' });
  for (const [restaurantId, date, pickupOnly] of [
    ['demo-north', '2026-11-04', true], ['demo-north', '2026-11-03', false],
    ['demo-north', '2026-11-05', false], ['demo-south', '2026-11-04', false],
  ]) {
    const facts = demo.lookupFacts({ restaurantId, date });
    assert.equal(facts.service.pickupOnly, pickupOnly);
    assert.equal(facts.corrections.length, pickupOnly ? 1 : 0);
    assert.equal(facts.service.deliveryAvailable, !pickupOnly);
  }
  assert.deepEqual(['reservation', 'recovery'].map(id => demo.getCase(id)), unrelatedBefore);
  const direct = demo.getCase('direct');
  assert.equal(direct.request.fulfillment, 'delivery');
  assert.ok(direct.blockers.some(item => item.code === 'PICKUP_ONLY'));
  rejectWithoutChangingCases(demo, () => command(demo, 'direct', 'prepare_quote'));
  command(demo, 'direct', 'confirm_pickup');
  command(demo, 'direct', 'prepare_quote');
  assert.equal(demo.getCase('direct').request.fulfillment, 'pickup');
  assert.equal(demo.getCase('direct').approval, null);
});

test('expired offers and expired menu/service evidence remain date-bounded', () => {
  const demo = createFrontDeskDemo();
  const today = demo.lookupFacts({ restaurantId: 'demo-north', date: '2026-11-04' });
  assert.equal(today.offers.find(item => item.id.endsWith('-offer-old')).status, 'expired');
  assert.equal(today.offers.find(item => item.id.endsWith('-offer-current')).status, 'current');
  const request = demo.getCase('direct').request;
  request.date = '2026-12-01';
  request.windows[0].readyAt = '2026-12-01T13:00:00-06:00';
  const quote = demo.calculateQuote({ restaurantId: 'demo-north', date: request.date, request });
  assert.equal(quote.valid, false);
  assert.ok(quote.blockers.some(item => item.code === 'FACTS_EXPIRED'));
});

test('unknown menu, insufficient lead time and excessive capacity cannot produce a valid quote', () => {
  const demo = createFrontDeskDemo();
  for (const alter of [
    request => { request.items[0].itemId = 'unapproved-special'; request.windows[0].items[0].itemId = 'unapproved-special'; },
    request => { request.windows[0].readyAt = '2026-11-04T10:30:00-06:00'; },
    request => { request.headlineQuantity = 17; request.items[0].quantity = 17; request.windows[0].items[0].quantity = 17; },
    request => { request.windows[0].responsibleRole = ''; },
  ]) {
    const request = demo.getCase('direct').request;
    alter(request);
    const quote = demo.calculateQuote({ restaurantId: 'demo-north', date: request.date, request });
    assert.equal(quote.valid, false);
    assert.ok(quote.blockers.length > 0);
  }
});

test('a later operator correction invalidates an already approved neighboring food case', () => {
  const demo = createFrontDeskDemo();
  command(demo, 'direct', 'prepare_quote'); approve(demo, 'direct');
  const old = demo.getCase('direct');
  command(demo, 'workplace', 'correct_pickup_only', { operator: 'Demo operator' });
  const changed = demo.getCase('direct');
  assert.ok(changed.version > old.version);
  assert.equal(changed.approval, null);
  assert.equal(changed.quote, null);
  assert.equal(changed.request.fulfillment, 'delivery');
  rejectWithoutChangingCases(demo, () => command(demo, 'direct', 'acknowledge_kitchen', {
    requestVersion: old.requestVersion, quoteId: old.quote.id,
  }));
  command(demo, 'direct', 'confirm_pickup');
  command(demo, 'direct', 'prepare_quote'); approve(demo, 'direct'); acknowledge(demo, 'direct');
  const fresh = demo.getCase('direct');
  assert.notEqual(fresh.quote.id, old.quote.id);
  assert.equal(fresh.kitchenPulls[0].fulfillment, 'pickup');
  assert.equal(fresh.receipts.at(-1).requestVersion, fresh.requestVersion);
});

test('cancellation needs release evidence and never becomes paid or fulfilled', () => {
  const demo = createFrontDeskDemo();
  quotedWorkplace(demo); approve(demo); acknowledge(demo);
  const accepted = demo.getCase('workplace');
  command(demo, 'workplace', 'request_cancellation');
  const pending = demo.getCase('workplace');
  assert.equal(pending.status, 'cancellation_requested');
  assert.equal(pending.commitment.status, 'cancellation_pending');
  assert.equal(pending.receipts.length, accepted.receipts.length);
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'revise_request', { change: 'add_one_garden' }));
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'acknowledge_cancellation', { requestVersion: accepted.requestVersion - 1 }));
  command(demo, 'workplace', 'acknowledge_cancellation', { requestVersion: pending.requestVersion });
  const canceled = demo.getCase('workplace');
  assert.equal(canceled.status, 'cancelled');
  assert.equal(canceled.paymentStatus, 'unknown');
  assert.equal(canceled.fulfillmentStatus, 'unknown');
  assert.equal(canceled.customerOutcome, 'unknown');
  assert.deepEqual(canceled.receipts.at(-1).affectedReceiptIds, accepted.commitment.receiptIds);
  assert.equal(canceled.receipts.at(-1).simulated, true);
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'prepare_quote'));
});

test('a table reservation never creates a food hold, kitchen pull, payment or attendance claim', () => {
  const demo = createFrontDeskDemo();
  const initial = demo.getCase('reservation');
  rejectWithoutChangingCases(demo, () => command(demo, 'reservation', 'acknowledge_reservation', { requestVersion: initial.requestVersion }));
  command(demo, 'reservation', 'approve_reservation', { requestVersion: initial.requestVersion, capacityAccepted: true, timingAccepted: true, operator: 'Demo operator' });
  assert.equal(demo.getCase('reservation').receipts.length, 0);
  command(demo, 'reservation', 'acknowledge_reservation', { requestVersion: initial.requestVersion });
  const booked = demo.getCase('reservation');
  assert.equal(booked.request.kind, 'reservation');
  assert.equal(booked.request.service, 'table');
  assert.equal(booked.receipts[0].guests, 6);
  assert.equal(booked.receipts[0].simulated, true);
  assert.equal(booked.quote, null);
  assert.deepEqual(booked.kitchenPulls, []);
  assert.equal(booked.fulfillmentStatus, 'unknown');
  assert.equal(booked.paymentStatus, 'unknown');
  assert.equal(booked.customerOutcome, 'unknown');
  rejectWithoutChangingCases(demo, () => command(demo, 'direct', 'approve_reservation', { requestVersion: demo.getCase('direct').requestVersion, capacityAccepted: true, timingAccepted: true, operator: 'Demo operator' }));
});

test('repeated complaints stay one case and remedy offer, authorization and simulated issuance stay separate', () => {
  const demo = createFrontDeskDemo();
  const otherCases = ['workplace', 'direct', 'reservation'].map(id => demo.getCase(id));
  const initial = demo.getCase('recovery');
  assert.equal(initial.messages.length, 2);
  assert.equal(demo.listCases().filter(item => item.type === 'recovery').length, 1);
  rejectWithoutChangingCases(demo, () => command(demo, 'recovery', 'issue_remedy'));
  command(demo, 'recovery', 'offer_remedy', { amountCents: 1200 });
  const offered = demo.getCase('recovery');
  assert.equal(offered.recovery.offeredCents, 1200);
  assert.equal(offered.recovery.authorizedCents, null);
  assert.equal(offered.recovery.issuedCents, null);
  assert.equal(offered.recovery.receiptId, null);
  rejectWithoutChangingCases(demo, () => command(demo, 'recovery', 'issue_remedy'));
  command(demo, 'recovery', 'authorize_remedy', { operator: 'Demo operator' });
  assert.equal(demo.getCase('recovery').recovery.issuedCents, null);
  assert.equal(demo.getCase('recovery').receipts.length, 0);
  command(demo, 'recovery', 'issue_remedy');
  const issued = demo.getCase('recovery');
  assert.equal(issued.recovery.issuedCents, 1200);
  assert.equal(issued.receipts.find(item => item.id === issued.recovery.receiptId).amountCents, 1200);
  assert.equal(issued.receipts.at(-1).simulated, true);
  for (const current of [initial, offered, issued]) {
    assert.equal(current.recovery.noCall, true);
    assert.equal(current.recovery.contactChannel, 'message');
    assert.equal(current.recovery.owner, 'Demo service lead');
    assert.equal(current.customerOutcome, 'unknown');
  }
  rejectWithoutChangingCases(demo, () => command(demo, 'recovery', 'issue_remedy'));
  assert.deepEqual(['workplace', 'direct', 'reservation'].map(id => demo.getCase(id)), otherCases);
});

test('operator adoption preserves a model proposal disagreement and does not verify client-claimed model provenance', () => {
  const demo = createFrontDeskDemo();
  const initial = demo.getCase('workplace');
  const extracted = proposalFromRequest(initial.request);
  command(demo, 'workplace', 'apply_request_proposal', {
    proposal: extracted, operator: 'Demo operator',
    provenance: { mode: 'recorded-meta', responseId: 'synthetic-client-claimed-response' },
  });
  const adopted = demo.getCase('workplace');
  assert.equal(adopted.requestVersion, initial.requestVersion + 1);
  assert.equal(adopted.request.headlineQuantity, 12);
  assert.equal(adopted.quantityCheck.computedQuantity, 13);
  assert.equal(adopted.quantityCheck.matches, false);
  assert.equal(adopted.proposalSource.sourceVerified, false);
  assert.equal(adopted.approval, null);
  assert.equal(adopted.quote, null);
  assert.deepEqual(adopted.receipts, []);
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'prepare_quote'));
  extracted.items[0].quantity = 99;
  assert.equal(demo.getCase('workplace').request.items[0].quantity, 6);
});

test('adopting a changed proposal cannot carry an earlier approval or receipt into the new version', () => {
  const demo = createFrontDeskDemo();
  quotedWorkplace(demo); approve(demo); acknowledge(demo);
  const old = demo.getCase('workplace');
  const extracted = proposalFromRequest(old.request);
  extracted.destination = 'Fictional Workshop C';
  command(demo, 'workplace', 'apply_request_proposal', { proposal: extracted, operator: 'Demo operator' });
  const adopted = demo.getCase('workplace');
  assert.equal(adopted.request.destination, 'Fictional Workshop C');
  assert.equal(adopted.approval, null);
  assert.equal(adopted.quote, null);
  assert.deepEqual(adopted.kitchenPulls, []);
  assert.deepEqual(adopted.receipts, old.receipts);
  assert.deepEqual(adopted.commitment.request, old.request);
  assert.equal(adopted.commitment.status, 'change_pending');
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'acknowledge_kitchen', { requestVersion: old.requestVersion, quoteId: old.quote.id }));
});

test('generic proposal adoption rejects extra execution fields, invented provenance and impossible dates atomically', () => {
  for (const alter of [
    payload => { payload.proposal.paid = true; },
    payload => { payload.proposal.items[0].unitPriceCents = 1; },
    payload => { payload.provenance = { mode: 'recorded-meta', responseId: 'synthetic-response', sourceVerified: true }; },
    payload => { payload.operator = 'Model'; },
    payload => { payload.proposal.date = '2026-02-31'; payload.proposal.windows[0].readyAt = '2026-02-31T13:00:00-06:00'; },
    payload => { payload.proposal.items[0].quantity = 1.5; },
    payload => { payload.proposal.items.push(structuredClone(payload.proposal.items[0])); },
    payload => { payload.proposal.items[0].itemId = 'unapproved-special'; payload.proposal.windows[0].items[0].itemId = 'unapproved-special'; },
  ]) {
    const demo = createFrontDeskDemo();
    const payload = { proposal: proposalFromRequest(demo.getCase('direct').request), operator: 'Demo operator' };
    alter(payload);
    rejectWithoutChangingCases(demo, () => command(demo, 'direct', 'apply_request_proposal', payload));
  }
});

test('an extracted food proposal cannot convert a reservation, recovery or canceled case into an order', () => {
  const demo = createFrontDeskDemo();
  const extracted = proposalFromRequest(demo.getCase('direct').request);
  for (const id of ['reservation', 'recovery']) {
    rejectWithoutChangingCases(demo, () => command(demo, id, 'apply_request_proposal', { proposal: extracted, operator: 'Demo operator' }));
  }
  command(demo, 'direct', 'request_cancellation');
  command(demo, 'direct', 'acknowledge_cancellation', { requestVersion: demo.getCase('direct').requestVersion });
  rejectWithoutChangingCases(demo, () => command(demo, 'direct', 'apply_request_proposal', { proposal: extracted, operator: 'Demo operator' }));
});

test('a changed adopted proposal remains usable with unfamiliar window IDs and no existing garden line', () => {
  const demo = createFrontDeskDemo();
  const extracted = {
    kind: 'food', date: '2026-11-04', fulfillment: 'pickup', headlineQuantity: 4,
    items: [{ itemId: 'cheese', quantity: 2 }, { itemId: 'pepper', quantity: 2 }],
    windows: [
      { id: 'first', readyAt: '2026-11-04T12:00:00-06:00', items: [{ itemId: 'cheese', quantity: 1 }, { itemId: 'pepper', quantity: 1 }] },
      { id: 'later', readyAt: '2026-11-04T18:00:00-06:00', items: [{ itemId: 'cheese', quantity: 1 }, { itemId: 'pepper', quantity: 1 }] },
    ], destination: 'Fictional pickup counter',
  };
  command(demo, 'workplace', 'apply_request_proposal', { proposal: extracted, operator: 'Demo operator' });
  command(demo, 'workplace', 'prepare_quote'); approve(demo); acknowledge(demo);
  const old = demo.getCase('workplace');
  command(demo, 'workplace', 'revise_request', { change: 'add_one_garden' });
  const revised = demo.getCase('workplace');
  assert.equal(revised.request.headlineQuantity, 5);
  assert.equal(revised.request.items.find(item => item.itemId === 'garden').quantity, 1);
  assert.equal(revised.quantityCheck.matches, true);
  assert.equal(revised.quantityCheck.windowsMatch, true);
  assert.equal(revised.approval, null);
  assert.deepEqual(revised.receipts, old.receipts);
  command(demo, 'workplace', 'prepare_quote');
  assert.equal(demo.getCase('workplace').quote.totalCents, 8300);
});

const packet = () => ({
  synthetic: true, scenarioId: 'acceptance-demo', restaurantId: 'demo-north',
  demoNow: '2026-11-04T10:00:00-06:00',
  message: 'Is the autumn offer current? I need 12 pizzas: 6 cheese, 4 pepper and 3 garden, split into two windows of 6 and 7. This is a synthetic acceptance case.',
});
const proposal = (overrides = {}) => ({
  intent: 'workplace-meal', status: 'needs-clarification',
  summary: 'The item lines total thirteen; the stated quantity needs clarification.',
  reply: 'The previous offer has expired. Did you intend thirteen pizzas as listed?',
  questions: ['Should the item lines remain thirteen pizzas?'],
  sourceIds: ['demo-north-menu-v1', 'demo-north-offer-old'],
  proposal: null,
  ...overrides,
});
const toolCall = (callId, name, args) => ({ type: 'function_call', call_id: callId, name, arguments: JSON.stringify(args) });
const finalMessage = result => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result) }] });
const responseFor = (output, number = 1) => new Response(JSON.stringify({
  id: `synthetic-response-${number}`, model: 'muse-spark-1.3', status: 'completed', output,
  usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200, headers: { 'content-type': 'application/json' } });

function mockReviewOptions(demo, outputs) {
  let index = 0;
  const requests = [];
  return {
    requests,
    options: {
      apiKey: 'synthetic-acceptance-key',
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(init.body));
        assert.ok(index < outputs.length, 'The adapter made an unexpected extra model request.');
        return responseFor(outputs[index++], index);
      },
      lookupFacts: input => demo.lookupFacts(input),
      checkQuantities: input => demo.checkQuantities(input),
    },
  };
}

test('model fact and quantity tools produce a proposal without changing any operational case', async () => {
  const demo = createFrontDeskDemo();
  const before = snapshot(demo);
  const request = demo.getCase('workplace').request;
  const mocked = mockReviewOptions(demo, [
    [
      toolCall('facts-1', 'lookup_restaurant_facts', { date: '2026-11-04', topics: ['menu', 'offers', 'service'] }),
      toolCall('quantities-1', 'check_order_quantities', {
        headlineQuantity: request.headlineQuantity, items: request.items,
        windows: request.windows.map(({ id, items }) => ({ id, items })),
      }),
    ],
    [finalMessage(proposal())],
  ]);
  const result = await reviewFrontDesk(packet(), mocked.options);
  assert.deepEqual(snapshot(demo), before);
  assert.equal(result.mode, 'mocked-review');
  assert.equal(result.liveVerified, false);
  assert.equal(result.recorded, false);
  assert.equal(result.receipt.transport, 'mocked');
  assert.equal(result.receipt.semanticReviewRequired, true);
  assert.equal(result.tools.length, 2);
  assert.equal(result.tools[1].result.matches, false);
  assert.equal(result.tools[1].result.computedQuantity, 13);
  assert.equal(mocked.requests.length, 2);
  assert.equal(result.result.status, 'needs-clarification');
  assert.match(result.notice, /No customer message.*was executed/);
});

test('one unauthorized execution tool causes the entire proposed tool batch to be rejected', async () => {
  const demo = createFrontDeskDemo();
  const before = snapshot(demo);
  let lookups = 0;
  const mocked = mockReviewOptions(demo, [[
    toolCall('read-first', 'lookup_restaurant_facts', { date: '2026-11-04', topics: ['menu'] }),
    toolCall('execute-next', 'acknowledge_kitchen', { caseId: 'workplace', requestVersion: 1, quoteId: 'synthetic-quote' }),
  ]]);
  mocked.options.lookupFacts = input => { lookups += 1; return demo.lookupFacts(input); };
  await assert.rejects(reviewFrontDesk(packet(), mocked.options));
  assert.equal(lookups, 0, 'No tool should run before the complete batch is validated.');
  assert.deepEqual(snapshot(demo), before);
});

test('the model cannot switch restaurant scope through added tool arguments', async () => {
  const demo = createFrontDeskDemo();
  let lookups = 0;
  const mocked = mockReviewOptions(demo, [[toolCall('scope-escape', 'lookup_restaurant_facts', {
    date: '2026-11-04', topics: ['menu'], restaurantId: 'demo-south',
  })]]);
  mocked.options.lookupFacts = input => { lookups += 1; return demo.lookupFacts(input); };
  await assert.rejects(reviewFrontDesk(packet(), mocked.options));
  assert.equal(lookups, 0);
});

test('a model cannot invent source references or add executed state to the final proposal schema', async () => {
  for (const bad of [proposal({ sourceIds: ['synthetic-fact-never-retrieved'] }), { ...proposal(), paid: true, fulfilled: true }]) {
    const demo = createFrontDeskDemo();
    const before = snapshot(demo);
    const mocked = mockReviewOptions(demo, [
      [toolCall('facts', 'lookup_restaurant_facts', { date: '2026-11-04', topics: ['all'] })],
      [finalMessage(bad)],
    ]);
    await assert.rejects(reviewFrontDesk(packet(), mocked.options));
    assert.deepEqual(snapshot(demo), before);
  }
});

test('the request budget gate can stop the adapter before any transport or tool execution', async () => {
  const demo = createFrontDeskDemo();
  const before = snapshot(demo);
  const mocked = mockReviewOptions(demo, []);
  mocked.options.beforeRequest = async () => { throw new Error('Synthetic test budget exhausted'); };
  await assert.rejects(reviewFrontDesk(packet(), mocked.options), /Synthetic test budget exhausted/);
  assert.equal(mocked.requests.length, 0);
  assert.deepEqual(snapshot(demo), before);
});

test('every advertised fact topic is handled by the actual engine without a generic tool error', async () => {
  const demo = createFrontDeskDemo();
  const tool = FRONT_DESK_TOOLS.find(item => item.name === 'lookup_restaurant_facts');
  const topics = tool.parameters.properties.topics.items.enum;
  assert.ok(Array.isArray(topics) && topics.length > 0);
  for (const topic of topics) {
    const mocked = mockReviewOptions(demo, [
      [toolCall(`facts-${topic}`, tool.name, { date: '2026-11-04', topics: [topic] })],
      [finalMessage(proposal())],
    ]);
    const result = await reviewFrontDesk(packet(), mocked.options);
    assert.equal(result.tools[0].result.error, undefined);
    assert.equal(result.tools[0].result.restaurantId, 'demo-north');
  }
});

test('an unknown headline remains unresolved while the quantity tool still computes the known item sum', async () => {
  const demo = createFrontDeskDemo();
  const mocked = mockReviewOptions(demo, [
    [toolCall('missing-headline', 'check_order_quantities', {
      headlineQuantity: null, items: [{ itemId: 'cheese', quantity: 2 }], windows: [],
    })],
    [finalMessage(proposal({ sourceIds: [], questions: ['Please confirm the intended quantity and service time.'] }))],
  ]);
  const result = await reviewFrontDesk(packet(), mocked.options);
  const calculation = result.tools[0].result;
  assert.equal(calculation.error, undefined, 'An unknown headline is missing information, not an unavailable calculation.');
  assert.equal(calculation.computedQuantity, 2);
  assert.equal(calculation.matches, false);
  assert.ok(calculation.issues.length > 0);
});

test('nullable unknown proposal fields survive model review but cannot become a restaurant commitment', async () => {
  const demo = createFrontDeskDemo();
  const unknown = { kind: 'food', date: null, fulfillment: null, headlineQuantity: null, items: [], windows: [{ id: 'unknown', readyAt: null, items: [] }], destination: null };
  const mocked = mockReviewOptions(demo, [[finalMessage(proposal({ sourceIds: [], proposal: unknown }))]]);
  const before = snapshot(demo);
  const result = await reviewFrontDesk(packet(), mocked.options);
  assert.deepEqual(result.result.proposal, unknown);
  assert.deepEqual(snapshot(demo), before);
  rejectWithoutChangingCases(demo, () => command(demo, 'workplace', 'apply_request_proposal', { proposal: result.result.proposal, operator: 'Demo operator' }));
});

test('menu item IDs and window IDs cannot masquerade as retrieved source citations', async () => {
  const demo = createFrontDeskDemo();
  for (const fakeSource of ['cheese', 'lunch']) {
    const mocked = mockReviewOptions(demo, [
      [toolCall('facts', 'lookup_restaurant_facts', { date: '2026-11-04', topics: ['all'] })],
      [finalMessage(proposal({ sourceIds: [fakeSource] }))],
    ]);
    await assert.rejects(reviewFrontDesk(packet(), mocked.options));
  }
});

test('the advertised quantity upper bounds execute through the real arithmetic engine', async () => {
  const demo = createFrontDeskDemo();
  const items = Array.from({ length: 10 }, (_, index) => ({ itemId: `item-${index}`, quantity: 10 }));
  const windows = [2, 2, 3, 3].map((quantity, index) => ({ id: `window-${index}`, items: items.map(item => ({ itemId: item.itemId, quantity })) }));
  const mocked = mockReviewOptions(demo, [
    [toolCall('bounded-counts', 'check_order_quantities', { headlineQuantity: 100, items, windows })],
    [finalMessage(proposal({ sourceIds: [] }))],
  ]);
  const result = await reviewFrontDesk(packet(), mocked.options);
  assert.equal(result.tools[0].result.error, undefined);
  assert.equal(result.tools[0].result.computedQuantity, 100);
  assert.equal(result.tools[0].result.windowsTotal, 100);
  assert.equal(result.tools[0].result.windowsMatch, true);
});

test('out-of-contract counts, windows and topics are rejected before the engine is invoked', async () => {
  const good = { headlineQuantity: 2, items: [{ itemId: 'cheese', quantity: 2 }], windows: [] };
  const badCalls = [
    ['check_order_quantities', { ...good, headlineQuantity: 101 }],
    ['check_order_quantities', { ...good, items: [{ itemId: 'cheese', quantity: 0 }] }],
    ['check_order_quantities', { ...good, items: Array.from({ length: 11 }, (_, i) => ({ itemId: `item-${i}`, quantity: 1 })) }],
    ['check_order_quantities', { ...good, windows: Array.from({ length: 5 }, (_, i) => ({ id: `window-${i}`, items: [{ itemId: 'cheese', quantity: 1 }] })) }],
    ['check_order_quantities', { ...good, items: [{ itemId: 'CHEESE', quantity: 2 }] }],
    ['lookup_restaurant_facts', { date: '2026-11-04', topics: ['execute-order'] }],
  ];
  for (const [name, args] of badCalls) {
    const demo = createFrontDeskDemo();
    let executions = 0;
    const mocked = mockReviewOptions(demo, [[toolCall('invalid-boundary', name, args)]]);
    mocked.options.lookupFacts = () => { executions += 1; return {}; };
    mocked.options.checkQuantities = () => { executions += 1; return {}; };
    await assert.rejects(reviewFrontDesk(packet(), mocked.options));
    assert.equal(executions, 0);
    assert.equal(mocked.requests.length, 1);
  }
});

test('a complete reviewed model food proposal is adoptable only through a separate operator action', async () => {
  const demo = createFrontDeskDemo();
  const initial = demo.getCase('direct');
  const extracted = proposalFromRequest(initial.request);
  const mocked = mockReviewOptions(demo, [
    [toolCall('facts', 'lookup_restaurant_facts', { date: '2026-11-04', topics: ['menu', 'service'] })],
    [finalMessage(proposal({ intent: 'direct-order', sourceIds: ['demo-north-menu-v1'], proposal: extracted }))],
  ]);
  const result = await reviewFrontDesk({ ...packet(), message: 'Synthetic guest requests two cheese pizzas for 1 p.m. today at Fictional Studio B.' }, mocked.options);
  assert.deepEqual(demo.getCase('direct'), initial);
  command(demo, 'direct', 'apply_request_proposal', { proposal: result.result.proposal, operator: 'Demo operator' });
  const adopted = demo.getCase('direct');
  assert.equal(adopted.requestVersion, initial.requestVersion + 1);
  assert.deepEqual(proposalFromRequest(adopted.request), extracted);
  assert.equal(adopted.approval, null);
  assert.deepEqual(adopted.receipts, []);
});
