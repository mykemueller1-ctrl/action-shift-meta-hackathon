// New November 4, 2026 event-period implementation. All records below are newly authored fiction.
// No private restaurant corpus, pre-event implementation, model request or external adapter is used.
import { createHash } from 'node:crypto';
import { makePickupCorrection, validateCorrections } from './front-desk-corrections.mjs';

export const DEMO_NOW = '2026-11-04T10:00:00-06:00';
export const DEMO_DATE = '2026-11-04';
export const DEMO_NOTICE = 'Authored tool simulation · fictional restaurant records · no model call or external action';
const clone = value => structuredClone(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 1, max = 100) => Number.isSafeInteger(value) && value >= min && value <= max;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(code, message, status = 400, blockers) {
  const error = Object.assign(new Error(message), { code, status });
  if (blockers) error.blockers = clone(blockers);
  throw error;
}
function fields(payload, required = [], optional = []) {
  if (!plain(payload) || required.some(key => !Object.hasOwn(payload, key)) || Object.keys(payload).some(key => ![...required, ...optional].includes(key))) fail('FRONT_DESK_INPUT', 'Use the documented fields for this local demo action.');
}
const restaurants = new Map([['demo-north', 'Maple Street Kitchen'], ['demo-south', 'Maple Street South']]);
const menu = [
  { id: 'cheese', name: 'Classic cheese pizza', unitPriceCents: 1500 },
  { id: 'pepper', name: 'Roasted pepper pizza', unitPriceCents: 1800 },
  { id: 'garden', name: 'Garden pizza', unitPriceCents: 1700 },
];
const baseItems = () => [{ itemId: 'cheese', quantity: 6 }, { itemId: 'pepper', quantity: 4 }, { itemId: 'garden', quantity: 3 }];
const baseWindows = () => [
  { id: 'lunch', readyAt: '2026-11-04T12:00:00-06:00', items: [{ itemId: 'cheese', quantity: 3 }, { itemId: 'pepper', quantity: 2 }, { itemId: 'garden', quantity: 1 }], responsibleRole: 'Demo lunch lead' },
  { id: 'evening', readyAt: '2026-11-04T18:00:00-06:00', items: [{ itemId: 'cheese', quantity: 3 }, { itemId: 'pepper', quantity: 2 }, { itemId: 'garden', quantity: 2 }], responsibleRole: 'Demo evening lead' },
];

function initialCase(id, type, title, request, messages, recovery = null) {
  return { id, type, title, restaurantId: 'demo-north', version: 1, requestVersion: 1, status: 'requested', mode: 'authored-simulation', simulated: true, modelCalls: 0,
    messages, request, quote: null, approval: null, kitchenPulls: [], receipts: [], history: [], recovery, commitment: null, reviewedReply: null,
    paymentStatus: 'unknown', fulfillmentStatus: 'unknown', customerOutcome: 'unknown' };
}
function initialCases() {
  const message = (id, channel, text) => ({ id, channel, text, at: DEMO_NOW, synthetic: true });
  return new Map([
    ['workplace', initialCase('workplace', 'workplace-meal', 'From food post to two crew meals', {
      kind: 'food', headlineQuantity: 12, items: baseItems(), date: DEMO_DATE, fulfillment: 'delivery', destination: 'Fictional Workshop A', windows: baseWindows(),
    }, [
      message('post-1', 'food-post', 'Fresh pizzas from Maple Street Kitchen. Ask us about feeding your crew.'),
      message('praise-1', 'comment', 'Those look good!'),
      message('question-1', 'message', 'Is the autumn lunch special still available today? What is a current choice?'),
      message('request-1', 'message', 'We need 12 pizzas today: 6 cheese, 4 roasted pepper and 3 garden. Please deliver to Fictional Workshop A, with 6 at noon and 7 at 6 p.m.'),
    ])],
    ['direct', initialCase('direct', 'direct-order', 'A new guest asks about delivery today', {
      kind: 'food', headlineQuantity: 2, items: [{ itemId: 'cheese', quantity: 2 }], date: DEMO_DATE, fulfillment: 'delivery', destination: 'Fictional Studio B',
      windows: [{ id: 'pickup', readyAt: '2026-11-04T13:00:00-06:00', items: [{ itemId: 'cheese', quantity: 2 }], responsibleRole: 'Demo counter lead' }],
    }, [message('direct-1', 'message', 'Could I order two cheese pizzas for 1 p.m. today, delivered to Fictional Studio B?')])],
    ['reservation', initialCase('reservation', 'reservation', 'A table request stays a table request', {
      kind: 'reservation', date: DEMO_DATE, guests: 6, startsAt: '2026-11-04T18:30:00-06:00', service: 'table',
    }, [message('reservation-1', 'message', 'Could our fictional group of six have a table at 6:30 this evening?')])],
    ['recovery', initialCase('recovery', 'recovery', 'A remedy needs its own receipt', { kind: 'recovery', date: DEMO_DATE }, [
      message('recovery-1', 'message', 'My fictional pickup order was cold. Please reply here; do not call.'),
      message('recovery-2', 'message', 'Following up on the same cold-order concern. I still prefer messages, not a call.'),
    ], { status: 'reported', noCall: true, contactChannel: 'message', owner: 'Demo service lead', nextStep: 'Review the reported issue and reply in this conversation.', offeredCents: null, authorizedCents: null, issuedCents: null, receiptId: null })],
  ]);
}

export function checkQuantities({ headlineQuantity, items, windows = [] } = {}) {
  if (!(headlineQuantity === null || integer(headlineQuantity)) || !Array.isArray(items) || items.length < 1 || items.length > 10 || !Array.isArray(windows) || windows.length > 4) fail('FRONT_DESK_INPUT', 'Supply a bounded integer quantity or an explicitly missing headline, item lines and service windows.');
  const totals = new Map();
  for (const item of items) {
    if (!plain(item) || typeof item.itemId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(item.itemId) || !integer(item.quantity) || totals.has(item.itemId)) fail('FRONT_DESK_INPUT', 'Each item needs a unique item ID and a positive integer quantity.');
    totals.set(item.itemId, item.quantity);
  }
  const computedQuantity = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const allocations = new Map(); const windowIds = new Set();
  for (const window of windows) {
    if (!plain(window) || typeof window.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(window.id) || windowIds.has(window.id) || !Array.isArray(window.items) || !window.items.length || window.items.length > 10) fail('FRONT_DESK_INPUT', 'Each service window needs a unique ID and item allocations.');
    windowIds.add(window.id); const seen = new Set();
    for (const item of window.items) {
      if (!plain(item) || !totals.has(item.itemId) || !integer(item.quantity) || seen.has(item.itemId)) fail('FRONT_DESK_INPUT', 'Window allocations must use unique known item IDs and positive integers.');
      seen.add(item.itemId); allocations.set(item.itemId, (allocations.get(item.itemId) || 0) + item.quantity);
    }
  }
  const windowsTotal = [...allocations.values()].reduce((sum, value) => sum + value, 0);
  const matches = headlineQuantity === computedQuantity;
  const windowsMatch = windows.length > 0 && [...totals].every(([id, quantity]) => allocations.get(id) === quantity);
  const issues = [];
  if (headlineQuantity === null) issues.push({ code: 'QUANTITY_MISSING', message: `No headline quantity was supplied; the item lines add to ${computedQuantity}. Confirm the intended total before quoting.` });
  else if (!matches) issues.push({ code: 'QUANTITY_MISMATCH', message: `The headline says ${headlineQuantity}; the item lines add to ${computedQuantity}. Ask which quantity is intended.` });
  if (!windowsMatch) issues.push({ code: 'WINDOW_QUANTITY_MISMATCH', message: 'Service-window allocations must reconcile to each item line.' });
  return { statedQuantity: headlineQuantity, computedQuantity, matches, windowsTotal, windowsMatch, issues, simulated: true, calculation: 'Integer sum of supplied item quantities; no model calculation.' };
}

export function createFrontDeskDemo({ correctionStorage } = {}) {
  if (correctionStorage !== undefined && (!correctionStorage || correctionStorage.mode !== 'local-json' || correctionStorage.durable !== true
    || ['load', 'save', 'assertCurrent'].some(key => typeof correctionStorage[key] !== 'function'))) fail('FRONT_DESK_CORRECTION_STATE', 'Use a validated local correction storage adapter.', 503);
  let cases = initialCases();
  const corrections = correctionStorage ? validateCorrections(correctionStorage.load()) : [];
  const loadedCount = corrections.length;
  const assertStorage = () => correctionStorage?.assertCurrent();
  const storageStatus = () => ({ mode: correctionStorage?.mode || 'memory', durable: Boolean(correctionStorage), count: corrections.length,
    revision: corrections.length, loadedCount, caseState: 'memory', casesResetOnRestart: true });
  const getRaw = id => { const value = cases.get(id); if (!value) fail('FRONT_DESK_NOT_FOUND', 'Choose an available synthetic case.', 404); return value; };
  function lookupFacts({ restaurantId = 'demo-north', date = DEMO_DATE, topics } = {}) {
    assertStorage();
    if (!restaurants.has(restaurantId) || typeof date !== 'string' || !/^2026-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) fail('FRONT_DESK_INPUT', 'Choose an available fictional restaurant and a valid demo date.');
    if (topics !== undefined && (!Array.isArray(topics) || topics.some(topic => !['menu', 'offers', 'service', 'capacity', 'corrections', 'all'].includes(topic)))) fail('FRONT_DESK_INPUT', 'Choose supported restaurant fact topics.');
    const activeCorrections = corrections.filter(rule => rule.restaurantId === restaurantId && rule.validFrom <= date && date <= rule.validTo);
    const pickupOnly = activeCorrections.some(rule => rule.kind === 'pickup-only');
    const sources = [
      { id: `${restaurantId}-menu-v1`, label: 'Authored demo menu', restaurantId, validFrom: '2026-11-01', validTo: '2026-11-30', text: 'Synthetic tax-inclusive menu prices: cheese 1500 cents, roasted pepper 1800 cents, garden 1700 cents.' },
      { id: `${restaurantId}-service-v1`, label: 'Authored demo service policy', restaurantId, validFrom: '2026-11-01', validTo: '2026-11-30', text: 'Fictional local delivery and pickup; at least 90 minutes lead time; up to 16 pizzas per service window; table capacity 40.' },
      { id: `${restaurantId}-offer-old`, label: 'Previous autumn lunch offer', restaurantId, validFrom: '2026-11-01', validTo: '2026-11-03', text: 'Autumn lunch special, valid November 1 through November 3 only.' },
      { id: `${restaurantId}-offer-current`, label: 'Current garden choice', restaurantId, validFrom: '2026-11-04', validTo: '2026-11-10', text: 'Garden pizza is the current featured choice from November 4 through November 10 at the approved menu price.' },
      ...activeCorrections.map(rule => ({ id: rule.id, label: 'Reviewed demo operator correction', restaurantId, validFrom: rule.validFrom, validTo: rule.validTo, text: rule.text })),
    ];
    const offers = sources.filter(source => source.id.includes('-offer-')).map(source => ({ id: source.id, name: source.label, validFrom: source.validFrom, validTo: source.validTo, status: date < source.validFrom ? 'future' : date > source.validTo ? 'expired' : 'current', sourceId: source.id }));
    return clone({ restaurantId, restaurantName: restaurants.get(restaurantId), date, demoNow: DEMO_NOW, mode: 'authored-simulation', synthetic: true,
      menu: menu.map(item => ({ ...item, sourceId: `${restaurantId}-menu-v1`, taxInclusive: true })), offers,
      service: { pickupOnly, deliveryAvailable: !pickupOnly, minimumLeadMinutes: 90, capacityPerWindow: 16, reservationCapacity: 40, sourceIds: [`${restaurantId}-service-v1`, ...activeCorrections.map(rule => rule.id)] },
      sources, corrections: activeCorrections, correctionHistory: corrections.filter(rule => rule.restaurantId === restaurantId), factVersion: hash(sources).slice(0, 16), notice: DEMO_NOTICE });
  }
  function calculateQuote({ restaurantId = 'demo-north', date = DEMO_DATE, request } = {}) {
    if (!plain(request) || request.kind !== 'food' || request.date !== date || !Array.isArray(request.windows)) fail('FRONT_DESK_INPUT', 'A food quote requires its exact dated request and service windows.');
    const facts = lookupFacts({ restaurantId, date });
    const quantities = checkQuantities(request); const blockers = [...quantities.issues];
    if (!['pickup', 'delivery'].includes(request.fulfillment) || typeof request.destination !== 'string' || !request.destination.trim()) blockers.push({ code: 'FULFILLMENT_MISSING', message: 'Confirm the service mode and destination.' });
    if (request.fulfillment === 'delivery' && facts.service.pickupOnly) blockers.push({ code: 'PICKUP_ONLY', message: 'The approved operator correction makes this restaurant pickup-only on this date. Ask the customer before changing the request.' });
    const items = request.items.map(line => {
      const item = facts.menu.find(value => value.id === line.itemId);
      if (!item) { blockers.push({ code: 'MENU_ITEM_UNKNOWN', message: 'An item is absent from the approved demo menu.' }); return null; }
      return { itemId: item.id, name: item.name, quantity: line.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.unitPriceCents * line.quantity, sourceId: item.sourceId };
    }).filter(Boolean);
    if (date < '2026-11-01' || date > '2026-11-30') blockers.push({ code: 'FACTS_EXPIRED', message: 'The demo menu and service policy do not cover that date.' });
    for (const window of request.windows) {
      const time = Date.parse(window.readyAt);
      if (typeof window.readyAt !== 'string' || !/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-06:00$/.test(window.readyAt) || window.readyAt.slice(0, 10) !== date || !Number.isFinite(time) || time - Date.parse(DEMO_NOW) < facts.service.minimumLeadMinutes * 60_000) blockers.push({ code: 'TIMING_UNCONFIRMED', message: 'Each window needs an exact local time with the required lead time.' });
      if (window.items.reduce((sum, line) => sum + line.quantity, 0) > facts.service.capacityPerWindow) blockers.push({ code: 'CAPACITY_EXCEEDED', message: 'The requested service window exceeds the demo capacity; an operator must resolve it.' });
      if (typeof window.responsibleRole !== 'string' || !window.responsibleRole.trim()) blockers.push({ code: 'OWNER_MISSING', message: 'Each kitchen pull needs a responsible role.' });
    }
    const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    return { valid: blockers.length === 0, blockers, quantityCheck: quantities, items, totalCents, currency: 'USD', priceBasis: 'Fictional tax-inclusive menu prices; no real charge.', factIds: facts.sources.filter(source => !source.id.includes('-offer-')).map(source => source.id), factVersion: facts.factVersion, requestHash: hash({ restaurantId, request, factVersion: facts.factVersion }), simulated: true };
  }
  function allowedActions(value, blockers) {
    if (value.status === 'cancelled') return [];
    if (value.status === 'cancellation_requested') return ['acknowledge_cancellation'];
    if (value.type === 'recovery') return value.recovery.status === 'reported' ? ['offer_remedy'] : value.recovery.status === 'offered' ? ['authorize_remedy'] : value.recovery.status === 'authorized' ? ['issue_remedy'] : [];
    if (value.type === 'reservation') return value.commitment?.status === 'acknowledged' ? ['request_cancellation'] : value.approval ? ['acknowledge_reservation', 'request_cancellation'] : ['approve_reservation', 'request_cancellation'];
    const actions = ['apply_request_proposal'];
    if (!corrections.some(rule => rule.restaurantId === value.restaurantId && rule.validFrom === value.request.date)) actions.unshift('correct_pickup_only');
    if (blockers.some(item => ['QUANTITY_MISMATCH', 'QUANTITY_MISSING'].includes(item.code))) actions.push('clarify_quantity');
    if (blockers.some(item => item.code === 'PICKUP_ONLY')) actions.push('confirm_pickup');
    if (!blockers.length && !value.quote) actions.push('prepare_quote');
    if (value.quote && !value.approval && !blockers.length) actions.push('approve_quote');
    if (value.approval && value.commitment?.requestVersion !== value.requestVersion && !blockers.length) actions.push('acknowledge_kitchen');
    if (value.id === 'workplace' && !blockers.some(item => ['QUANTITY_MISMATCH', 'QUANTITY_MISSING'].includes(item.code))) actions.push('revise_request');
    actions.push('request_cancellation');
    return actions;
  }
  function view(value) {
    let blockers = []; let quantityCheck = null;
    if (value.request.kind === 'food') { const preview = calculateQuote({ restaurantId: value.restaurantId, date: value.request.date, request: value.request }); blockers = preview.blockers; quantityCheck = preview.quantityCheck; }
    return clone({ ...value, blockers, quantityCheck, allowedActions: allowedActions(value, blockers), notice: DEMO_NOTICE });
  }
  function invalidate(value, status = 'revision_requested') {
    value.quote = null; value.approval = null; value.kitchenPulls = []; value.status = status;
    if (value.commitment) value.commitment.status = 'change_pending';
  }
  function exactRequest(value, payload, quote = false) {
    if (payload.requestVersion !== value.requestVersion || (quote && (!value.quote || payload.quoteId !== value.quote.id))) fail('FRONT_DESK_STALE_APPROVAL', 'The request or quote changed. Review the current version before continuing.', 409);
  }
  function operator(payload) { if (payload.operator !== 'Demo operator') fail('FRONT_DESK_APPROVAL_REQUIRED', 'This demo requires an explicit Demo operator review.'); }
  function appendEvent(value, action, summary, before) {
    value.version += 1;
    const event = { id: `${value.id}-event-${value.version}`, version: value.version, requestVersion: value.requestVersion, action, summary, at: DEMO_NOW, simulated: true,
      before: { status: before.status, requestVersion: before.requestVersion, request: clone(before.request), quoteId: before.quote?.id || null },
      after: { status: value.status, requestVersion: value.requestVersion, quoteId: value.quote?.id || null }, proposalSource: clone(value.proposalSource || null),
      ...(action === 'review_recorded_reply' ? { replyReview: clone(value.reviewedReply), previousReplyReview: clone(before.reviewedReply) } : {}) };
    value.history.push(event); return event;
  }
  function actionImpl({ caseId, expectedVersion, action: name, payload = {} } = {}, context = {}) {
    const current = getRaw(caseId);
    if (expectedVersion !== current.version) fail('FRONT_DESK_STALE_VERSION', 'This case changed. Reload it before applying an action.', 409);
    if (typeof name !== 'string' || !plain(payload)) fail('FRONT_DESK_INPUT', 'Supply a local action and its payload.');
    const value = clone(current); let summary;
    const foodOnly = () => { if (value.request.kind !== 'food') fail('FRONT_DESK_WRONG_CASE', 'This action applies only to a food request.'); };
    const active = () => { if (['cancelled', 'cancellation_requested'].includes(value.status)) fail('FRONT_DESK_TRANSITION', 'Cancellation must be resolved before another change.'); };
    switch (name) {
      case 'apply_request_proposal': {
        fields(payload, ['proposal', 'operator'], ['provenance']); foodOnly(); active(); operator(payload);
        const proposal = payload.proposal;
        fields(proposal, ['kind', 'date', 'fulfillment', 'headlineQuantity', 'items', 'windows', 'destination']);
        if (proposal.kind !== 'food' || typeof proposal.date !== 'string' || !/^2026-\d{2}-\d{2}$/.test(proposal.date)
          || !Number.isFinite(Date.parse(`${proposal.date}T00:00:00Z`)) || new Date(`${proposal.date}T00:00:00Z`).toISOString().slice(0, 10) !== proposal.date
          || !integer(proposal.headlineQuantity) || !['pickup', 'delivery'].includes(proposal.fulfillment) || typeof proposal.destination !== 'string' || !proposal.destination.trim() || proposal.destination.length > 160 || /[<>\p{Cf}\r\n]/u.test(proposal.destination)
          || !Array.isArray(proposal.windows) || proposal.windows.length < 1 || proposal.windows.length > 4) fail('FRONT_DESK_INPUT', 'A reviewed proposal needs bounded food, date, service, destination and window fields.');
        checkQuantities(proposal); // Validate bounds, but retain a genuine mismatch for clarification.
        for (const item of proposal.items) {
          fields(item, ['itemId', 'quantity']);
          if (!menu.some(entry => entry.id === item.itemId)) fail('FRONT_DESK_INPUT', 'Proposed items must exist in the approved synthetic menu.');
        }
        for (const window of proposal.windows) {
          fields(window, ['id', 'readyAt', 'items']);
          if (typeof window.readyAt !== 'string' || !/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-06:00$/.test(window.readyAt) || !Number.isFinite(Date.parse(window.readyAt)) || window.readyAt.slice(0, 10) !== proposal.date) fail('FRONT_DESK_INPUT', 'Each proposed window needs an exact valid time on the request date.');
          for (const item of window.items) fields(item, ['itemId', 'quantity']);
        }
        if (payload.provenance !== undefined) {
          fields(payload.provenance, ['mode', 'responseId']);
          if (!['authored', 'recorded-meta'].includes(payload.provenance.mode) || !(payload.provenance.responseId === null || (typeof payload.provenance.responseId === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(payload.provenance.responseId)))) fail('FRONT_DESK_INPUT', 'Use a bounded proposal source reference.');
        }
        const priorWindows = value.request.windows;
        value.request = { ...clone(proposal), windows: proposal.windows.map(window => ({ ...clone(window), responsibleRole: priorWindows.find(old => old.id === window.id)?.responsibleRole || 'Demo kitchen lead' })) };
        value.requestVersion += 1; invalidate(value, 'proposal_reviewed');
        value.proposalSource = { kind: 'operator-reviewed', reference: clone(payload.provenance || { mode: 'authored', responseId: null }), sourceVerified: context.verifiedRecord === true,
          verification: context.verifiedRecord === true ? 'Validated server-bound local record; not independent provider attestation.' : 'Client-provided source reference; not verified model provenance.' };
        if (context.recordedSource) {
          Object.assign(value.proposalSource, clone(context.recordedSource), { originalProposal: clone(proposal) });
          value.messages.push({ id: `${value.id}-model-source-${value.requestVersion}`, channel: 'model-reviewed-source', text: context.recordedSource.input.message,
            at: DEMO_NOW, synthetic: true, sourceMode: 'recorded-meta', reviewId: context.recordedSource.reviewId, responseId: context.recordedSource.responseId,
            sourceMessageSha256: context.recordedSource.sourceMessageSha256 });
        }
        summary = 'Operator adopted the exact extracted proposal as a new request version. Counts were retained, not repaired; quote, price, timing, capacity and kitchen acknowledgment require separate checks.'; break;
      }
      case 'review_recorded_reply': {
        fields(payload, ['operator', 'text']); operator(payload);
        if (!context.recordedSource || typeof context.originalReply !== 'string') fail('FRONT_DESK_RECORD', 'Reply review requires a configured server-bound recorded result.');
        if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 2500 || /[<>\p{Cf}\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(payload.text)) fail('FRONT_DESK_INPUT', 'Use a bounded plain-text draft without markup or hidden controls.');
        value.reviewedReply = { reviewId: context.recordedSource.reviewId, responseId: context.recordedSource.responseId, sourceMessageSha256: context.recordedSource.sourceMessageSha256,
          originalReply: context.originalReply, text: payload.text, operator: payload.operator, reviewedAt: new Date().toISOString(), status: 'reviewed-unsent', sent: false };
        summary = 'Operator reviewed an edited draft beside the original recorded reply. The draft remains unsent; no restaurant, kitchen, payment or recovery action was performed.'; break;
      }
      case 'clarify_quantity': {
        fields(payload, ['quantity']); foodOnly(); active();
        const quantity = checkQuantities(value.request);
        if (quantity.matches || payload.quantity !== quantity.computedQuantity) fail('FRONT_DESK_QUANTITY', 'This authored correction must explicitly confirm the item-line total.');
        value.request.headlineQuantity = payload.quantity; value.requestVersion += 1; invalidate(value, 'clarified');
        value.messages.push({ id: `${value.id}-clarification-${value.requestVersion}`, channel: 'customer-clarification', text: `Authored customer correction: keep the item lines; ${payload.quantity} pizzas is intended.`, at: DEMO_NOW, synthetic: true });
        summary = 'Customer clarification retained; quantities now reconcile.'; break;
      }
      case 'prepare_quote': {
        fields(payload); foodOnly(); active(); if (value.quote) fail('FRONT_DESK_TRANSITION', 'The current version already has a quote.');
        const preview = calculateQuote({ restaurantId: value.restaurantId, date: value.request.date, request: value.request });
        if (!preview.valid) fail('FRONT_DESK_BLOCKED', 'Resolve the request blockers before preparing a quote.', 400, preview.blockers);
        value.quote = { ...preview, id: `quote-${value.id}-r${value.requestVersion}-${preview.requestHash.slice(0, 10)}`, requestVersion: value.requestVersion }; value.status = 'quoted';
        summary = 'Integer-cent quote prepared from current demo menu and service facts.'; break;
      }
      case 'approve_quote': {
        fields(payload, ['requestVersion', 'quoteId', 'priceAccepted', 'timingAccepted', 'capacityAccepted', 'operator']); foodOnly(); active(); operator(payload); exactRequest(value, payload, true);
        if (value.approval || payload.priceAccepted !== true || payload.timingAccepted !== true || payload.capacityAccepted !== true) fail('FRONT_DESK_APPROVAL_REQUIRED', 'Explicit price, timing and capacity approval is required once for this version.');
        const preview = calculateQuote({ restaurantId: value.restaurantId, date: value.request.date, request: value.request });
        if (!preview.valid || preview.requestHash !== value.quote.requestHash) fail('FRONT_DESK_STALE_APPROVAL', 'The quote no longer matches current facts.', 409);
        value.approval = { id: `approval-${value.id}-${value.version + 1}`, requestVersion: value.requestVersion, quoteId: value.quote.id, requestHash: value.quote.requestHash, operator: payload.operator, at: DEMO_NOW, priceAccepted: true, timingAccepted: true, capacityAccepted: true, simulated: true };
        value.status = 'operator_approved'; summary = 'Operator approved this exact quote, timing and capacity; kitchen acknowledgment is still pending.'; break;
      }
      case 'acknowledge_kitchen': {
        fields(payload, ['requestVersion', 'quoteId']); foodOnly(); active(); exactRequest(value, payload, true);
        if (!value.approval || value.approval.requestVersion !== value.requestVersion || value.approval.quoteId !== value.quote.id || value.commitment?.requestVersion === value.requestVersion) fail('FRONT_DESK_APPROVAL_REQUIRED', 'A current, unacknowledged operator approval is required.');
        const preview = calculateQuote({ restaurantId: value.restaurantId, date: value.request.date, request: value.request });
        if (!preview.valid || preview.requestHash !== value.approval.requestHash) fail('FRONT_DESK_STALE_APPROVAL', 'Current facts no longer match the operator approval.', 409);
        value.kitchenPulls = value.request.windows.map(window => ({ id: `pull-${value.id}-r${value.requestVersion}-${window.id}`, windowId: window.id, requestVersion: value.requestVersion, quoteId: value.quote.id, readyAt: window.readyAt, items: clone(window.items), quantity: window.items.reduce((sum, item) => sum + item.quantity, 0), destination: value.request.destination, fulfillment: value.request.fulfillment, responsibleRole: window.responsibleRole, simulated: true }));
        const receipts = value.kitchenPulls.map(pull => ({ id: `SIM-KITCHEN-${pull.id}`, type: 'kitchen-acknowledgment', requestVersion: value.requestVersion, quoteId: value.quote.id, requestHash: value.quote.requestHash, approvalId: value.approval.id, pullId: pull.id, windowId: pull.windowId, quantity: pull.quantity, at: DEMO_NOW, simulated: true }));
        value.receipts.push(...receipts); value.commitment = { requestVersion: value.requestVersion, quoteId: value.quote.id, request: clone(value.request), receiptIds: receipts.map(item => item.id), status: 'acknowledged', simulated: true }; value.status = 'kitchen_acknowledged';
        summary = 'Simulator acknowledged each separate kitchen pull for the exact approved version. Fulfillment and payment remain unknown.'; break;
      }
      case 'revise_request': {
        fields(payload, ['change']); foodOnly(); active(); if (value.id !== 'workplace' || !['add_one_garden', 'move_evening'].includes(payload.change)) fail('FRONT_DESK_INPUT', 'Choose a supported authored workplace change.');
        if (!checkQuantities(value.request).matches) fail('FRONT_DESK_QUANTITY', 'Clarify the original quantity disagreement before recording a later change.');
        const laterWindow = [...value.request.windows].sort((a, b) => Date.parse(b.readyAt) - Date.parse(a.readyAt))[0];
        if (!laterWindow) fail('FRONT_DESK_TRANSITION', 'A service window is required before applying this authored change.');
        let changeText;
        if (payload.change === 'add_one_garden') {
          const line = value.request.items.find(item => item.itemId === 'garden');
          if (line) line.quantity += 1; else value.request.items.push({ itemId: 'garden', quantity: 1 });
          const allocation = laterWindow.items.find(item => item.itemId === 'garden');
          if (allocation) allocation.quantity += 1; else laterWindow.items.push({ itemId: 'garden', quantity: 1 });
          value.request.headlineQuantity = value.request.items.reduce((sum, item) => sum + item.quantity, 0);
          changeText = `Authored customer change: please add one garden pizza to the ${laterWindow.id} service window. Keep the other items and times unchanged. The revised total is ${value.request.headlineQuantity}.`;
        } else {
          const nextTime = new Date(Date.parse(laterWindow.readyAt) + 30 * 60_000 - 6 * 60 * 60_000).toISOString().slice(0, 19) + '-06:00';
          if (nextTime.slice(0, 10) !== value.request.date) fail('FRONT_DESK_TRANSITION', 'This authored time change must stay on the requested service date.');
          laterWindow.readyAt = nextTime;
          changeText = `Authored customer change: move the ${laterWindow.id} service window thirty minutes later to ${nextTime}. Keep its item quantities unchanged.`;
        }
        value.requestVersion += 1;
        value.messages.push({ id: `${value.id}-customer-change-${value.requestVersion}`, channel: 'customer-change', text: changeText, at: DEMO_NOW, synthetic: true });
        invalidate(value); summary = 'Revised request preserved the earlier commitment and invalidated the current quote and approval. Kitchen change handling is pending.'; break;
      }
      case 'request_cancellation': {
        fields(payload); active(); if (value.type === 'recovery') fail('FRONT_DESK_WRONG_CASE', 'A recovery concern cannot be closed by canceling an order.');
        value.status = 'cancellation_requested'; value.approval = null; value.kitchenPulls = []; if (value.commitment) value.commitment.status = 'cancellation_pending';
        summary = 'Cancellation requested. Existing restaurant or kitchen commitments await a release acknowledgment.'; break;
      }
      case 'acknowledge_cancellation': {
        fields(payload, ['requestVersion']); exactRequest(value, payload); if (value.status !== 'cancellation_requested') fail('FRONT_DESK_TRANSITION', 'Request cancellation before recording its simulated acknowledgment.');
        value.receipts.push({ id: `SIM-CANCEL-${value.id}-${value.version + 1}`, type: 'cancellation-acknowledgment', requestVersion: value.requestVersion, affectedCommitmentVersion: value.commitment?.requestVersion || null, affectedReceiptIds: value.commitment?.receiptIds || [], at: DEMO_NOW, simulated: true });
        value.status = 'cancelled'; if (value.commitment) value.commitment.status = 'released_by_simulator'; summary = 'Simulator acknowledged release. Cancellation does not establish a refund, payment or fulfillment.'; break;
      }
      case 'correct_pickup_only': {
        fields(payload, ['operator']); foodOnly(); active(); operator(payload);
        if (corrections.some(rule => rule.restaurantId === value.restaurantId && rule.validFrom === value.request.date && rule.kind === 'pickup-only')) fail('FRONT_DESK_TRANSITION', 'This dated restaurant correction is already recorded.');
        const rule = makePickupCorrection({ sequence: corrections.length + 1, restaurantId: value.restaurantId, date: value.request.date });
        corrections.push(rule);
        for (const [id, other] of cases) {
          if (id === caseId || other.restaurantId !== value.restaurantId || other.request.date !== value.request.date || other.request.kind !== 'food' || ['cancelled', 'cancellation_requested'].includes(other.status)) continue;
          const changed = clone(other); changed.requestVersion += 1; invalidate(changed, 'operator_correction_pending'); appendEvent(changed, name, 'Dated restaurant correction advances the review version and requires fresh approval and any necessary customer clarification.', other); cases.set(id, changed);
        }
        value.requestVersion += 1; invalidate(value, 'operator_correction_pending'); summary = 'Operator correction retained beside the original policy, scoped to this restaurant and this date. The review version advances; future fact lookups retrieve it.'; break;
      }
      case 'confirm_pickup': {
        fields(payload); foodOnly(); active(); if (value.request.fulfillment !== 'delivery' || !lookupFacts({ restaurantId: value.restaurantId, date: value.request.date }).service.pickupOnly) fail('FRONT_DESK_TRANSITION', 'This action confirms pickup only after the dated service correction.');
        value.request.fulfillment = 'pickup'; value.request.destination = `${restaurants.get(value.restaurantId)} pickup counter`; value.requestVersion += 1; invalidate(value, 'clarified');
        value.messages.push({ id: `${value.id}-pickup-${value.requestVersion}`, channel: 'customer-clarification', text: 'Authored customer reply: pickup at the restaurant works for the requested times.', at: DEMO_NOW, synthetic: true });
        summary = 'Explicit authored customer pickup confirmation retained. A new quote and approval are required.'; break;
      }
      case 'approve_reservation': {
        fields(payload, ['requestVersion', 'capacityAccepted', 'timingAccepted', 'operator']); active(); operator(payload); exactRequest(value, payload);
        if (value.type !== 'reservation') fail('FRONT_DESK_WRONG_CASE', 'Table approval applies only to a reservation.');
        const facts = lookupFacts({ restaurantId: value.restaurantId, date: value.request.date });
        if (value.approval || !integer(value.request.guests, 1, facts.service.reservationCapacity) || payload.capacityAccepted !== true || payload.timingAccepted !== true) fail('FRONT_DESK_APPROVAL_REQUIRED', 'A table request requires explicit capacity and timing review.');
        value.approval = { id: `approval-${value.id}-${value.version + 1}`, requestVersion: value.requestVersion, requestHash: hash(value.request), operator: payload.operator, at: DEMO_NOW, capacityAccepted: true, timingAccepted: true, simulated: true }; value.status = 'operator_approved'; summary = 'Operator reviewed this table request; no food order, payment or attendance is inferred.'; break;
      }
      case 'acknowledge_reservation': {
        fields(payload, ['requestVersion']); active(); exactRequest(value, payload);
        if (value.type !== 'reservation' || !value.approval || value.approval.requestVersion !== value.requestVersion || value.approval.requestHash !== hash(value.request) || value.commitment) fail('FRONT_DESK_APPROVAL_REQUIRED', 'A current unacknowledged table approval is required.');
        const receipt = { id: `SIM-TABLE-${value.id}-${value.version + 1}`, type: 'reservation-acknowledgment', requestVersion: value.requestVersion, requestHash: hash(value.request), guests: value.request.guests, startsAt: value.request.startsAt, at: DEMO_NOW, simulated: true };
        value.receipts.push(receipt); value.commitment = { requestVersion: value.requestVersion, request: clone(value.request), receiptIds: [receipt.id], status: 'acknowledged', simulated: true }; value.status = 'reservation_acknowledged'; summary = 'Simulator acknowledged the table version. Attendance and payment remain unknown.'; break;
      }
      case 'offer_remedy': {
        fields(payload, ['amountCents']); if (value.type !== 'recovery' || value.recovery.status !== 'reported' || !integer(payload.amountCents, 1, 5000)) fail('FRONT_DESK_TRANSITION', 'Offer a bounded fictional remedy once for the reported recovery case.');
        value.recovery.offeredCents = payload.amountCents; value.recovery.status = 'offered'; value.recovery.nextStep = 'Operator reviews the proposed remedy; reply by message only.'; value.status = 'remedy_offered'; summary = 'Remedy offered, not authorized or issued. The no-call restriction remains attached.'; break;
      }
      case 'authorize_remedy': {
        fields(payload, ['operator']); operator(payload); if (value.type !== 'recovery' || value.recovery.status !== 'offered') fail('FRONT_DESK_TRANSITION', 'An offered remedy must precede operator authorization.');
        value.recovery.authorizedCents = value.recovery.offeredCents; value.recovery.status = 'authorized'; value.recovery.nextStep = 'Await a distinct simulated issuance receipt; reply by message only.'; value.status = 'remedy_authorized'; summary = 'Operator authorized the offered remedy. Issuance is still pending.'; break;
      }
      case 'issue_remedy': {
        fields(payload); if (value.type !== 'recovery' || value.recovery.status !== 'authorized') fail('FRONT_DESK_TRANSITION', 'Remedy issuance requires prior operator authorization.');
        const receipt = { id: `SIM-REMEDY-${value.id}-${value.version + 1}`, type: 'remedy-issuance', amountCents: value.recovery.authorizedCents, at: DEMO_NOW, simulated: true };
        value.receipts.push(receipt); value.recovery.issuedCents = receipt.amountCents; value.recovery.receiptId = receipt.id; value.recovery.status = 'issued'; value.recovery.nextStep = 'Check the guest outcome by message; simulator issuance does not establish actual guest recovery.'; value.status = 'remedy_issued'; summary = 'Separate simulator receipt records issuance. No real refund or recovered guest outcome is claimed.'; break;
      }
      default: fail('FRONT_DESK_ACTION', 'Choose a supported local demo action.');
    }
    const event = appendEvent(value, name, summary, current); cases.set(caseId, value);
    return { case: view(value), eventsAdded: [clone(event)], notice: DEMO_NOTICE };
  }
  function action(command, context) {
    assertStorage();
    // A rejected command cannot leave a partial correction or another case mutated.
    const beforeCases = clone(cases); const beforeCorrections = clone(corrections);
    try {
      const result = actionImpl(command, context);
      // Persist only after all validation/view work succeeds, before acknowledging the action.
      if (correctionStorage && corrections.length !== beforeCorrections.length) correctionStorage.save(corrections);
      return { ...result, correctionStorage: storageStatus() };
    }
    catch (error) { cases = beforeCases; corrections.splice(0, corrections.length, ...beforeCorrections); throw error; }
  }
  // Rebuild only the effect of retained facts. Conversations, approvals and receipts start fresh.
  for (const rule of corrections) {
    for (const [id, original] of cases) {
      if (original.request.kind !== 'food' || original.restaurantId !== rule.restaurantId || original.request.date !== rule.validFrom) continue;
      const changed = clone(original); changed.requestVersion += 1; invalidate(changed, 'operator_correction_pending');
      appendEvent(changed, 'restore_operator_correction', 'Previously reviewed restaurant/date correction restored from local storage. Case execution state was reset; a fresh quote and approval are required.', original);
      cases.set(id, changed);
    }
  }
  function recordedSource(command, review) {
    const target = getRaw(command.caseId);
    const responseId = review?.receipt?.id || review?.receipt?.requests?.at(-1)?.id;
    const input = review?.input;
    if (!plain(review) || review.recorded !== true || review.liveVerified !== true || review.receipt?.transport !== 'live'
      || review.caseId !== command.caseId || !plain(input) || input.synthetic !== true || input.restaurantId !== target.restaurantId
      || input.demoNow !== DEMO_NOW || input.scenarioId !== command.reviewId || review.scenarioId !== command.reviewId
      || typeof command.reviewId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(command.reviewId)
      || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 5000
      || typeof responseId !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(responseId)) fail('FRONT_DESK_RECORD', 'The server-bound recorded source does not match this case, restaurant and demo clock.');
    fields(input, ['synthetic', 'scenarioId', 'restaurantId', 'demoNow', 'message']);
    const actualInput = { synthetic: true, restaurantId: input.restaurantId, demoNow: input.demoNow, message: input.message };
    if (review.modelInput !== undefined) {
      fields(review.modelInput, ['synthetic', 'restaurantId', 'demoNow', 'message']);
      if (Object.keys(actualInput).some(key => actualInput[key] !== review.modelInput[key])) fail('FRONT_DESK_RECORD', 'The recorded model input and source receipt disagree.');
    }
    return { reviewId: command.reviewId, responseId, input: actualInput, sourceMessageSha256: createHash('sha256').update(input.message, 'utf8').digest('hex') };
  }
  return {
    getStatus: () => { assertStorage(); return { mode: 'authored-simulation', modelCalls: 0, demoNow: DEMO_NOW, demoDate: DEMO_DATE, notice: DEMO_NOTICE, recordedReviews: [], correctionStorage: storageStatus() }; },
    listCases: () => { assertStorage(); return [...cases.values()].map(value => ({ id: value.id, type: value.type, title: value.title, restaurantId: value.restaurantId, version: value.version, requestVersion: value.requestVersion, status: value.status })); },
    getCase: id => { assertStorage(); return view(getRaw(id)); }, lookupFacts, checkQuantities, calculateQuote, action: command => action(command),
    applyRecordedProposal: (command, review) => {
      fields(command, ['caseId', 'expectedVersion', 'reviewId', 'operator']);
      const source = recordedSource(command, review);
      if (!review.result?.proposal) fail('FRONT_DESK_RECORD', 'The recorded result has no complete food proposal to review.');
      return action({ caseId: command.caseId, expectedVersion: command.expectedVersion, action: 'apply_request_proposal', payload: {
        operator: command.operator, proposal: review.result.proposal, provenance: { mode: 'recorded-meta', responseId: source.responseId },
      } }, { verifiedRecord: true, recordedSource: source });
    },
    reviewRecordedReply: (command, review) => {
      fields(command, ['caseId', 'expectedVersion', 'reviewId', 'operator', 'text']);
      const source = recordedSource(command, review);
      if (typeof review.result?.reply !== 'string' || !review.result.reply.trim() || review.result.reply.length > 2500) fail('FRONT_DESK_RECORD', 'The recorded result has no bounded original reply.');
      return action({ caseId: command.caseId, expectedVersion: command.expectedVersion, action: 'review_recorded_reply', payload: { operator: command.operator, text: command.text } },
        { recordedSource: source, originalReply: review.result.reply });
    },
  };
}
export const createFrontDeskStore = createFrontDeskDemo;
