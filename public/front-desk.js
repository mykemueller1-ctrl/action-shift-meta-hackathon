'use strict';

// New event-period UI. Only the same-origin local simulator is contacted.
// Recorded Muse reviews are evidence; no model call or external action runs here.
const API = '/api/front-desk';
const $ = id => document.getElementById(id);
const state = { status: null, cases: [], facts: null, current: null, selected: 'workplace', busy: false, loadToken: 0, recorded: null, appliedReviewId: null, reviewId: null };
const caseNames = { workplace: 'Crew meals', direct: 'The next guest', reservation: 'Reservations', recovery: 'Guest care' };
const statusNames = { requested: 'Needs review', proposal_reviewed: 'Muse draft adopted', clarified: 'Details clarified', quoted: 'Quote ready', operator_approved: 'Operator approved', kitchen_acknowledged: 'Kitchen acknowledged', revision_requested: 'Changes need review', operator_correction_pending: 'Service rule changed', cancellation_requested: 'Cancellation pending', cancelled: 'Released in simulator', reservation_acknowledged: 'Table acknowledged', remedy_offered: 'Remedy offered', remedy_authorized: 'Remedy authorized', remedy_issued: 'Issuance recorded' };
let toastTimer;

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = String(text); return node; }
function clear(node) { node.replaceChildren(); }
function money(cents) { return Number.isSafeInteger(cents) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) : 'Not quoted'; }
function clock(value) { if (typeof value !== 'string' || !value.trim()) return 'Time not supplied'; const date = new Date(value); return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(date) : 'Time needs clarification'; }
function dateLabel(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return 'Date not supplied'; const date = new Date(`${value.slice(0, 10)}T12:00:00-06:00`); return Number.isFinite(date.valueOf()) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).format(date) : 'Date needs clarification'; }
function itemName(id) { return state.facts?.menu?.find(item => item.id === id)?.name || id; }
function shortItemName(id) { return itemName(id).replace(/ pizza$/i, ''); }
function tell(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000); }
function error(message, stale = false) { const box = $('error-banner'); clear(box); box.hidden = !message; if (!message) return; box.append(el('div', '', message)); if (stale) { const button = el('button', 'button secondary small', 'Reload the current version'); button.type = 'button'; button.addEventListener('click', () => loadWorkspace(state.selected)); box.append(button); } }
function addDetail(parent, label, value) { const row = el('div', 'detail-row'); row.append(el('span', '', label), el('strong', '', value)); parent.append(row); }

async function api(path, body) {
  let response;
  try { response = await fetch(`${API}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error('The local workspace is unavailable. Start the front-desk server, then refresh.'); }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('The local workspace returned an unreadable response. Nothing was accepted in this page.'); }
  if (!response.ok) throw Object.assign(new Error(typeof payload.error === 'string' ? payload.error : 'This step could not be completed.'), { status: response.status, code: payload.code, blockers: payload.blockers });
  return payload;
}

function setBusy(value) {
  state.busy = value; document.body.classList.toggle('busy', value);
  $('desk').setAttribute('aria-busy', String(value));
  for (const button of document.querySelectorAll('#case-tabs button, #action-controls button, #correction-button, #next-request-button, #refresh-button, #muse-button, #muse-review button')) button.disabled = value;
  if (!value && state.current) { renderActions(); renderLearning(); renderMuse(); }
}

async function loadWorkspace(id = state.selected) {
  const token = ++state.loadToken; error(''); setBusy(true);
  try {
    const [status, cases, current] = await Promise.all([api('/status'), api('/cases'), api(`/case?id=${encodeURIComponent(id)}`)]);
    const facts = await api(`/facts?restaurantId=${encodeURIComponent(current.restaurantId)}&date=${encodeURIComponent(current.request.date)}`);
    if (token !== state.loadToken) return;
    if (id !== state.selected) { state.recorded = null; state.reviewId = null; state.appliedReviewId = null; }
    Object.assign(state, { status, cases, current, facts, selected: id }); render();
  } catch (failure) { if (token === state.loadToken) error(failure.message, failure.status === 409); }
  finally { if (token === state.loadToken) setBusy(false); }
}

function renderTabs() {
  clear($('case-tabs'));
  state.cases.forEach((item, index) => { const button = el('button', 'case-tab'); button.type = 'button'; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(item.id === state.selected)); button.setAttribute('aria-controls', 'conversation-feed'); button.append(el('span', 'tab-number', String(index + 1).padStart(2, '0')), el('span', '', caseNames[item.id] || item.title)); button.addEventListener('click', () => loadWorkspace(item.id)); $('case-tabs').append(button); });
}

function renderFacts() {
  const facts = state.facts; $('restaurant-name').textContent = facts.restaurantName; $('workspace-date').textContent = `${dateLabel(facts.date)} · fictional training day`;
  $('global-notice').textContent = 'This is a local, authored simulation. No guest is contacted, no payment is taken, and no restaurant system is changed.';
  clear($('facts-strip'));
  const entries = [
    ['Current menu', `${facts.menu.length} priced choices`, false],
    ['Service today', facts.service.pickupOnly ? 'Pickup only' : 'Pickup or delivery', facts.service.pickupOnly],
    ['Offer check', facts.offers.some(offer => offer.status === 'expired') ? 'Old special expired' : 'Dates checked', true],
  ];
  for (const [label, value, warning] of entries) { const chip = el('div', `fact-chip${warning ? ' warning' : ''}`); chip.append(el('span', 'fact-dot'), el('span', '', `${label}: `), el('strong', '', value)); $('facts-strip').append(chip); }
  const target = $('source-facts'); clear(target);
  for (const item of facts.menu) { const row = el('div', 'source-item'); row.append(el('strong', '', `${item.name} · ${money(item.unitPriceCents)}`), el('small', '', `Fictional tax-inclusive price · ${item.sourceId}`)); target.append(row); }
  for (const offer of facts.offers) { const row = el('div', 'source-item'); row.append(el('strong', '', offer.name), el('span', offer.status === 'expired' ? 'expired' : '', `${offer.status === 'expired' ? 'Expired — cannot promise this offer' : offer.status === 'current' ? 'Current featured choice' : 'Not yet active'} · ${dateLabel(offer.validFrom)}–${dateLabel(offer.validTo)}`)); target.append(row); }
  const service = el('div', 'source-item'); service.append(el('strong', '', 'Service & capacity'), el('span', '', `${facts.service.minimumLeadMinutes} minutes minimum lead time · ${facts.service.capacityPerWindow} pizzas per window · ${facts.service.reservationCapacity} table seats in this fictional policy.`)); target.append(service);
  for (const source of facts.sources) { const details = el('details', 'source-item'); details.append(el('summary', '', source.label), el('p', '', source.text), el('small', '', `${source.id} · ${dateLabel(source.validFrom)}–${dateLabel(source.validTo)}`)); target.append(details); }
}

function renderConversation() {
  const current = state.current; $('conversation-title').textContent = current.id === 'workplace' ? 'A crew meal starts here.' : current.type === 'reservation' ? 'A place at the table.' : current.type === 'recovery' ? 'Care after the order.' : 'The next guest asks.';
  $('case-description').textContent = current.title;
  $('case-status').textContent = statusNames[current.status] || 'Needs operator review'; $('case-status').className = `small-label${current.status.includes('acknowledged') || current.status === 'remedy_issued' ? ' status-complete' : ''}`;
  const feed = $('conversation-feed'); clear(feed);
  for (const message of current.messages || []) {
    const brand = message.channel === 'food-post'; const clarification = message.channel === 'customer-clarification';
    const article = el('article', `message${brand ? '' : clarification ? ' operator' : ' guest'}`); const meta = el('div', 'message-meta');
    const label = brand ? `${state.facts.restaurantName} · fictional post` : clarification ? 'Guest clarification · authored' : message.channel === 'comment' ? 'Guest comment · fictional' : 'Guest message · fictional';
    const time = el('time', '', clock(message.at)); if (message.at) time.dateTime = message.at;
    meta.append(el('span', '', label), time); article.append(meta, el('p', '', message.text)); feed.append(article);
  }
  const quantity = current.quantityCheck; const quantityBox = $('quantity-card'); clear(quantityBox); quantityBox.hidden = !quantity || quantity.matches;
  if (quantity && !quantity.matches) { quantityBox.append(el('h4', '', 'One detail changes the whole order.')); const compare = el('div', 'quantity-compare'); const asked = el('div'); asked.append(el('strong', '', quantity.statedQuantity), el('span', '', 'in the headline')); const counted = el('div'); counted.append(el('strong', '', quantity.computedQuantity), el('span', '', 'in the item lines')); compare.append(asked, el('span', '', '≠'), counted); quantityBox.append(compare, el('p', '', `The kitchen windows also total ${quantity.windowsTotal}. Confirm the intended quantity before a quote can move forward.`)); }
  const blockers = $('blockers'); clear(blockers); blockers.hidden = !(current.blockers?.length);
  if (current.blockers?.length) { blockers.append(el('strong', '', 'Before making a commitment')); const list = el('ul'); current.blockers.forEach(blocker => list.append(el('li', '', blocker.message))); blockers.append(list); }
}

function renderQuote() {
  const current = state.current; $('request-version').textContent = `Request v${current.requestVersion}`; const target = $('quote-content'); clear(target); clear($('approval-content'));
  if (current.type === 'reservation') {
    const box = el('div', 'reservation-summary'); box.append(el('h4', '', 'Table request')); addDetail(box, 'Party size', `${current.request.guests} guests`); addDetail(box, 'Time', clock(current.request.startsAt)); addDetail(box, 'Date', dateLabel(current.request.date)); box.append(el('p', 'pending-note', 'A table request creates no food order or payment. The restaurant must acknowledge the reviewed version.')); target.append(box);
  } else if (current.type === 'recovery') {
    const recovery = current.recovery; const box = el('div', 'recovery-summary'); box.append(el('h4', '', 'Keep the guest’s preference attached.')); addDetail(box, 'Contact preference', recovery.noCall ? 'Message only · do not call' : recovery.contactChannel); addDetail(box, 'Follow-through', recovery.owner); addDetail(box, 'Offered', Number.isSafeInteger(recovery.offeredCents) ? money(recovery.offeredCents) : 'No remedy offered'); addDetail(box, 'Authorized', Number.isSafeInteger(recovery.authorizedCents) ? money(recovery.authorizedCents) : 'Awaiting owner review'); addDetail(box, 'Simulated issuance', Number.isSafeInteger(recovery.issuedCents) ? money(recovery.issuedCents) : 'No issuance receipt'); box.append(el('p', 'pending-note', recovery.nextStep)); target.append(box);
  } else if (current.quote) {
    const quote = current.quote; target.append(el('p', 'quote-meta', `${current.request.headlineQuantity} pizzas · ${current.request.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'} · ${current.request.windows.length} service window${current.request.windows.length === 1 ? '' : 's'}`));
    const table = el('table', 'quote-lines'); const thead = el('thead'); const hr = el('tr'); hr.append(el('th', '', 'CURRENT MENU'), el('th', '', 'LINE TOTAL')); thead.append(hr); const tbody = el('tbody');
    for (const item of quote.items) { const row = el('tr'); const detail = el('td'); detail.append(el('strong', '', item.name), el('span', '', `${item.quantity} × ${money(item.unitPriceCents)}`)); row.append(detail, el('td', '', money(item.lineTotalCents))); tbody.append(row); }
    table.append(thead, tbody); const total = el('div', 'quote-total'); total.append(el('span', '', 'Quoted total'), el('strong', '', money(quote.totalCents))); target.append(table, total, el('p', 'quote-footnote', 'Fictional, tax-inclusive menu prices. This quote does not charge anyone.'), el('p', 'quote-footnote', `For request v${quote.requestVersion}. A change needs a fresh quote and approval.`));
  } else {
    const empty = el('div', 'quote-empty'); empty.append(el('span', '', '↗'), el('h4', '', current.status === 'cancelled' ? 'This request is released.' : 'A clear quote comes next.'), el('p', '', current.blockers?.length ? 'Resolve the details in the conversation first. An old offer or uncertain quantity cannot become a promise.' : current.status === 'revision_requested' ? 'The request changed. The earlier quote and approval no longer cover this version.' : 'Use the current menu, service rule and confirmed quantity to prepare the quote.')); target.append(empty);
  }
  if (current.approval) { const box = el('div', 'approval-status'); box.append(el('strong', '', `✓ Operator reviewed request v${current.approval.requestVersion}`), el('p', '', current.request.kind === 'food' ? 'Price, timing and capacity accepted for this exact quote. The kitchen receipt below is a separate step.' : 'Timing and capacity accepted for this exact table request. Restaurant acknowledgment is separate.')); $('approval-content').append(box); }
  else if (current.status === 'cancellation_requested') { const box = el('div', 'approval-status pending'); box.append(el('strong', '', 'Cancellation is waiting for acknowledgment.'), el('p', '', 'Requesting a cancellation does not release an existing kitchen or table commitment by itself.')); $('approval-content').append(box); }
  else if (current.commitment && current.commitment.requestVersion !== current.requestVersion) { const box = el('div', 'approval-status pending'); box.append(el('strong', '', `Earlier v${current.commitment.requestVersion} is still on record.`), el('p', '', `Current request v${current.requestVersion} needs a new quote, approval and kitchen acknowledgment. The earlier receipt is retained in history.`)); $('approval-content').append(box); }
}

function renderKitchen() {
  const current = state.current; $('kitchen-title').textContent = current.type === 'reservation' ? 'The table handoff.' : current.type === 'recovery' ? 'The remedy receipt.' : 'Through to the kitchen.';
  document.querySelector('.kitchen-card .section-description').textContent = current.type === 'reservation' ? 'Owner approval and restaurant acknowledgment are separate steps.' : current.type === 'recovery' ? 'An offer, an authorization and an issuance receipt are separate steps.' : 'An owner’s approval and the kitchen’s receipt are separate steps.';
  const windows = $('service-windows'); clear(windows); const receipts = $('receipt-content'); clear(receipts);
  for (const [index, window] of (current.request.windows || []).entries()) {
    const quantity = window.items.reduce((sum, item) => sum + item.quantity, 0); const pull = current.kitchenPulls?.find(item => item.windowId === window.id && item.requestVersion === current.requestVersion);
    const card = el('div', 'window-card'); const detail = el('div'); detail.append(el('h4', '', `${clock(window.readyAt)} · ${quantity} pizzas`), el('p', '', window.items.map(item => `${item.quantity} ${shortItemName(item.itemId).toLowerCase()}`).join(' · ')), el('small', '', `${window.responsibleRole} · ${pull ? `accepted v${pull.requestVersion}` : 'planned, not acknowledged'}`)); card.append(el('span', 'window-number', index + 1), detail); windows.append(card);
  }
  if (current.request.kind === 'food' && current.request.destination) windows.append(el('p', 'pending-note', `${current.request.fulfillment === 'pickup' ? 'Pickup at' : 'Requested destination'}: ${current.request.destination}`));
  if (!current.receipts?.length) receipts.append(el('p', 'empty-note', current.type === 'recovery' ? 'An offer and an authorization are not issuance. A separate simulator receipt will appear here.' : 'No acknowledgment receipt yet. The simulator records only the exact version that was approved.'));
  for (const receipt of [...(current.receipts || [])].reverse()) {
    const cancelled = receipt.type === 'cancellation-acknowledgment'; const older = receipt.requestVersion && receipt.requestVersion !== current.requestVersion; const released = current.status === 'cancelled' && !cancelled;
    const card = el('div', `receipt${cancelled || older || released ? ' cancelled' : ''}`); const head = el('div', 'receipt-top');
    let title = receipt.type === 'kitchen-acknowledgment' ? `${receipt.windowId === 'lunch' ? 'Lunch' : receipt.windowId === 'evening' ? 'Evening' : 'Kitchen'} · ${receipt.quantity} pizzas · v${receipt.requestVersion}` : receipt.type === 'reservation-acknowledgment' ? `Table for ${receipt.guests} · v${receipt.requestVersion}` : cancelled ? `Cancellation acknowledged · v${receipt.requestVersion}` : `${money(receipt.amountCents)} remedy · simulated issuance`;
    head.append(el('span', 'receipt-check', cancelled ? '–' : '✓'), el('h4', '', title)); card.append(head);
    card.append(el('p', '', released ? 'Earlier acknowledgment retained in history. This commitment has since been released in the simulator.' : older ? 'Earlier version retained. This receipt does not acknowledge the current request.' : cancelled ? 'Simulator recorded the release. No refund or payment is established.' : receipt.type === 'remedy-issuance' ? 'A separate issuance receipt exists in the simulator. The guest’s outcome is still unknown.' : receipt.type === 'reservation-acknowledgment' ? 'The simulator acknowledged this table request. No actual restaurant booking or guest arrival is established.' : 'The simulator accepted this reviewed version. Preparation, fulfillment and payment remain unverified.'));
    const trace = el('details'); trace.append(el('summary', 'receipt-key', 'Receipt details'), el('p', 'receipt-key', receipt.id)); if (receipt.quoteId) trace.append(el('p', 'receipt-key', `Quote: ${receipt.quoteId}`)); if (receipt.approvalId) trace.append(el('p', 'receipt-key', `Approval: ${receipt.approvalId}`)); card.append(trace); receipts.append(card);
  }
}

const actionCopy = {
  clarify_quantity: ['Confirm 13 pizzas', 'primary'], confirm_pickup: ['Record guest’s pickup confirmation', 'primary'], prepare_quote: ['Prepare the current quote', 'primary'], approve_quote: ['Approve this version', 'primary'], acknowledge_kitchen: ['Get simulated kitchen receipts', 'primary'], revise_request: ['Change: add 1 garden pizza', 'secondary'], request_cancellation: ['Request cancellation', 'caution'], acknowledge_cancellation: ['Record simulated release', 'primary'], approve_reservation: ['Approve this table request', 'primary'], acknowledge_reservation: ['Get simulated table receipt', 'primary'], offer_remedy: ['Offer a $12 remedy', 'primary'], authorize_remedy: ['Authorize the $12 remedy', 'primary'], issue_remedy: ['Record simulated issuance', 'primary']
};
const order = ['clarify_quantity', 'confirm_pickup', 'prepare_quote', 'approve_quote', 'acknowledge_kitchen', 'acknowledge_cancellation', 'approve_reservation', 'acknowledge_reservation', 'offer_remedy', 'authorize_remedy', 'issue_remedy', 'revise_request', 'request_cancellation'];

function payloadFor(action) {
  const current = state.current;
  if (action === 'clarify_quantity') return { quantity: current.quantityCheck.computedQuantity };
  if (action === 'approve_quote') return { requestVersion: current.requestVersion, quoteId: current.quote.id, priceAccepted: $('approve-price').checked, timingAccepted: $('approve-timing').checked, capacityAccepted: $('approve-capacity').checked, operator: 'Demo operator' };
  if (action === 'acknowledge_kitchen') return { requestVersion: current.requestVersion, quoteId: current.quote.id };
  if (action === 'revise_request') return { change: 'add_one_garden' };
  if (action === 'acknowledge_cancellation' || action === 'acknowledge_reservation') return { requestVersion: current.requestVersion };
  if (action === 'correct_pickup_only' || action === 'authorize_remedy') return { operator: 'Demo operator' };
  if (action === 'approve_reservation') return { requestVersion: current.requestVersion, capacityAccepted: $('approve-capacity').checked, timingAccepted: $('approve-timing').checked, operator: 'Demo operator' };
  if (action === 'offer_remedy') return { amountCents: 1200 };
  return {};
}

function renderActions() {
  const target = $('action-controls'); clear(target); const current = state.current; if (!current) return;
  const allowed = new Set(current.allowedActions || []); let approvalButton = null; const checkIds = [];
  if (allowed.has('approve_quote') || allowed.has('approve_reservation')) {
    const checks = el('div', 'approval-checks'); const definitions = allowed.has('approve_quote') ? [['price', `I reviewed the ${money(current.quote.totalCents)} quote.`], ['timing', 'I reviewed the requested service times.'], ['capacity', 'I reviewed capacity for these service windows.']] : [['timing', 'I reviewed the requested table time.'], ['capacity', 'I reviewed capacity for this party.']];
    for (const [key, label] of definitions) { const row = el('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.id = `approve-${key}`; checkIds.push(input.id); input.addEventListener('change', () => { if (approvalButton) approvalButton.disabled = state.busy || !checkIds.every(id => $(id).checked); }); row.append(input, el('span', '', label)); checks.append(row); } target.append(checks);
  }
  for (const action of order) {
    if (!allowed.has(action)) continue;
    if (action === 'revise_request' && !current.quote && !current.commitment) continue;
    const [label, kind] = actionCopy[action]; const button = el('button', `button ${kind}${kind === 'primary' ? '' : ' small'}`, action === 'clarify_quantity' ? `Confirm ${current.quantityCheck.computedQuantity} pizzas` : label); button.type = 'button'; button.disabled = state.busy;
    if (action.startsWith('approve_')) { approvalButton = button; button.disabled = true; }
    button.addEventListener('click', () => runAction(action, payloadFor(action))); target.append(button);
  }
  if (!target.children.length) target.append(el('p', 'action-hint', current.status === 'cancelled' ? 'The simulator has acknowledged release. The full history remains below.' : current.type === 'recovery' ? 'Issuance is recorded. A real guest outcome has not been established.' : 'Review the receipt and history before making another commitment.'));
  else target.append(el('p', 'action-hint', 'Each button performs the labeled step in the local simulator only.'));
}

async function runAction(action, payload = {}) {
  if (state.busy || !state.current) return; const caseId = state.current.id; const expectedVersion = state.current.version; error(''); setBusy(true);
  try {
    const result = await api('/action', { caseId, expectedVersion, action, payload });
    state.current = result.case;
    const [facts, cases, status] = await Promise.all([api(`/facts?restaurantId=${encodeURIComponent(result.case.restaurantId)}&date=${encodeURIComponent(result.case.request.date)}`), api('/cases'), api('/status')]);
    Object.assign(state, { facts, cases, status }); if (action === 'apply_recorded_proposal') state.appliedReviewId = state.reviewId; render();
    tell(result.eventsAdded?.[0]?.summary || 'The local simulator recorded this step.');
  } catch (failure) { const extra = Array.isArray(failure.blockers) ? ` ${failure.blockers.map(item => item.message).join(' ')}` : ''; error(`${failure.message}${extra}`, failure.status === 409); }
  finally { setBusy(false); }
}

function renderLearning() {
  if (!state.facts || !state.current) return;
  const rule = state.facts.corrections?.find(item => item.kind === 'pickup-only'); $('rule-status').textContent = rule ? 'Owner correction active today' : 'Pickup or delivery in current policy';
  $('correction-button').disabled = state.busy || Boolean(rule) || !state.current.allowedActions?.includes('correct_pickup_only'); $('correction-button').textContent = rule ? 'Pickup-only rule recorded ✓' : 'Set pickup only today ↗';
  const target = $('learning-content'); clear(target);
  if (!rule) { target.append(el('p', 'learning-empty', 'The current service policy allows delivery or pickup. Record a reviewed correction to see the next guest request retrieve the new rule.')); }
  else {
    const list = el('ol', 'learning-timeline'); const earlier = state.current.history?.find(event => event.action === 'correct_pickup_only');
    const before = el('li'); before.append(el('strong', '', 'Before the correction'), el('span', '', earlier?.before?.request?.fulfillment === 'delivery' ? `The request proposed delivery${earlier.before.request.destination ? ` to ${earlier.before.request.destination}` : ''}. That earlier proposal stays in history.` : rule.previousValue));
    const correction = el('li'); correction.append(el('strong', '', 'The owner changes today’s rule'), el('span', '', 'Pickup only. Confirm that change with the guest before replacing a delivery request.'));
    const after = el('li'); after.append(el('strong', '', 'The next request gets the corrected fact'), el('span', '', 'Open “The next guest.” A delivery request must now pause for pickup confirmation. It cannot reuse an earlier approval.'));
    list.append(before, correction, after); const scope = el('div', 'scope-labels'); scope.append(el('span', '', state.facts.restaurantName), el('span', '', `${dateLabel(rule.validFrom)} only`), el('span', '', 'Reviewed owner correction')); target.append(list, scope);
  }
  target.append(el('p', 'learning-memory-note', 'Demo session memory: corrections reset when the local server restarts.'));
  $('next-request-button').disabled = state.busy;
}

function renderHistory() {
  const list = $('history-list'); clear(list);
  if (!state.current.history?.length) { const row = el('li'); row.append(el('strong', '', `Original request v${state.current.requestVersion}`), el('span', '', 'No decisions have been recorded in this case yet.')); list.append(row); }
  for (const event of [...(state.current.history || [])].reverse()) { const row = el('li'); row.append(el('strong', '', `Request v${event.requestVersion} · ${statusNames[event.after?.status] || 'Decision recorded'}`), el('span', '', event.summary), el('small', '', `${clock(event.at)} training clock · local history ${event.version}`)); if (event.before?.quoteId && event.before.quoteId !== event.after?.quoteId) row.append(el('small', '', `Earlier quote retained in history: ${event.before.quoteId}`)); list.append(row); }
}

function availableReview() { return state.status?.recordedReviews?.find(review => review.caseId === state.selected); }
function syncMuseButton() {
  const review = availableReview(); $('muse-button').disabled = state.busy || !review;
  $('muse-state').textContent = review ? 'Recorded live review' : 'Testing pending';
  $('muse-description').textContent = review ? 'Inspect a saved Muse review and the restaurant facts it requested. Opening it makes no new model call and changes no order.' : 'Muse workflow testing pending. The scenario controls above run an authored local simulation.';
}

function proposalClarifications(proposal) {
  const missing = [];
  const quantityIsValid = quantity => Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100;
  const itemsAreValid = items => Array.isArray(items) && items.length > 0 && items.length <= 10 && items.every(item => item && state.facts?.menu?.some(menu => menu.id === item.itemId) && quantityIsValid(item.quantity));
  const suppliedDate = typeof proposal.date === 'string' && /^2026-\d{2}-\d{2}$/.test(proposal.date) && Number.isFinite(Date.parse(`${proposal.date}T00:00:00Z`)) && new Date(`${proposal.date}T00:00:00Z`).toISOString().slice(0, 10) === proposal.date;
  if (!suppliedDate) missing.push('An exact service date');
  if (!quantityIsValid(proposal.headlineQuantity)) missing.push('The intended headline quantity');
  if (!['pickup', 'delivery'].includes(proposal.fulfillment)) missing.push('Pickup or delivery');
  if (typeof proposal.destination !== 'string' || !proposal.destination.trim() || proposal.destination.length > 160 || /[<>\p{Cf}\r\n]/u.test(proposal.destination)) missing.push('A clear pickup location or delivery destination');
  if (!itemsAreValid(proposal.items)) missing.push('Current menu choices and their quantities');
  if (!Array.isArray(proposal.windows) || !proposal.windows.length || proposal.windows.length > 4) missing.push('The service windows');
  else for (const [index, window] of proposal.windows.entries()) {
    if (typeof window.readyAt !== 'string' || !/^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-06:00$/.test(window.readyAt) || !Number.isFinite(Date.parse(window.readyAt)) || window.readyAt.slice(0, 10) !== proposal.date) missing.push(`An exact time on the service date for window ${index + 1}`);
    if (!itemsAreValid(window.items)) missing.push(`Menu choices and quantities for window ${index + 1}`);
  }
  return missing;
}

function renderProposedRequest(parent, proposal) {
  const box = el('div', 'reservation-summary'); box.append(el('h4', '', 'Muse’s proposed request · review before use'));
  addDetail(box, 'Date', dateLabel(proposal.date)); addDetail(box, 'Headline quantity', Number.isSafeInteger(proposal.headlineQuantity) ? `${proposal.headlineQuantity} pizzas` : 'Not supplied'); addDetail(box, 'Service', proposal.fulfillment || 'Not supplied'); addDetail(box, 'Destination', proposal.destination || 'Not supplied');
  if (!proposal.items?.length) addDetail(box, 'Menu choices', 'Not supplied');
  for (const item of proposal.items || []) addDetail(box, itemName(item.itemId), Number.isSafeInteger(item.quantity) ? `${item.quantity}` : 'Quantity not supplied');
  if (!proposal.windows?.length) addDetail(box, 'Service windows', 'Not supplied');
  for (const window of proposal.windows || []) addDetail(box, `${window.id} · ${clock(window.readyAt)}`, window.items?.length ? window.items.map(item => `${Number.isSafeInteger(item.quantity) ? item.quantity : 'Quantity not supplied'} ${shortItemName(item.itemId).toLowerCase()}`).join(' · ') : 'Menu choices and quantities not supplied');
  const missing = proposalClarifications(proposal);
  if (missing.length) { const note = el('div', 'blockers'); note.append(el('strong', '', 'Clarify these details before adopting a draft')); const list = el('ul'); missing.forEach(detail => list.append(el('li', '', detail))); note.append(list, el('p', 'pending-note', 'This saved review remains incomplete. No missing details have been guessed, and it cannot be adopted as an order.')); box.append(note); }
  box.append(el('p', 'pending-note', 'Adopting this draft creates a new request version. It does not approve the price, capacity, timing or kitchen handoff.'));
  const button = el('button', 'button secondary', missing.length ? 'Clarification needed before use' : state.appliedReviewId === state.reviewId ? 'Draft adopted · review the current version' : 'Use this as a draft'); button.type = 'button'; button.disabled = state.busy || missing.length > 0 || state.appliedReviewId === state.reviewId || ['cancelled', 'cancellation_requested'].includes(state.current.status); button.addEventListener('click', () => runAction('apply_recorded_proposal', { reviewId: state.reviewId, operator: 'Demo operator' })); box.append(button); parent.append(box);
}

function renderMuse() {
  syncMuseButton(); const target = $('muse-review'); clear(target); target.hidden = !state.recorded;
  if (!state.recorded) return;
  const packet = state.recorded; const result = packet.result;
  target.append(el('p', 'recorded-label', 'Recorded live Muse review · no new request'));
  if (packet.evaluation?.semanticReviewStatus === 'pass-with-limitations') {
    const limitations = el('div', 'blockers review-limitations'); limitations.append(el('strong', '', 'Independent review: passed with limitations'));
    const notes = el('ul'); for (const note of packet.evaluation.reviewNotes || []) notes.append(el('li', '', note)); limitations.append(notes);
    limitations.append(el('p', 'pending-note', 'This is the original saved model response. An operator must resolve these limitations before customer use. No draft reply has been sent.')); target.append(limitations);
  }
  const input = el('details', 'recorded-input'); input.open = true; input.append(el('summary', '', 'Exact synthetic request sent to Muse'), el('p', '', packet.input?.message || 'The recorded request was not supplied.'));
  input.append(el('small', '', 'This is the model’s actual input. It may differ from the authored starter conversation above.')); target.append(input, el('p', '', result.reply || result.summary));
  if (result.summary && result.summary !== result.reply) target.append(el('p', '', result.summary));
  if (result.questions?.length) { const list = el('ul'); result.questions.forEach(question => list.append(el('li', '', question))); target.append(list); }
  const calls = el('details'); calls.append(el('summary', '', `${packet.tools?.length || 0} recorded source/tool check${packet.tools?.length === 1 ? '' : 's'}`));
  for (const tool of packet.tools || []) {
    const entry = el('details', 'tool-call'); entry.append(el('summary', '', tool.name));
    if (tool.name === 'lookup_restaurant_facts' && tool.result) {
      entry.append(el('p', '', `Facts for ${dateLabel(tool.result.date)} · ${tool.result.restaurantName}`));
      for (const item of tool.result.menu || []) addDetail(entry, item.name, money(item.unitPriceCents));
      for (const offer of tool.result.offers || []) addDetail(entry, offer.name, `${offer.status} · ${dateLabel(offer.validFrom)}–${dateLabel(offer.validTo)}`);
      if (tool.result.service) addDetail(entry, 'Recorded service rule', tool.result.service.pickupOnly ? 'Pickup only' : 'Pickup or delivery');
    } else if (tool.name === 'check_order_quantities' && tool.result) {
      addDetail(entry, 'Headline quantity', tool.result.statedQuantity ?? 'Not supplied'); addDetail(entry, 'Item lines add to', tool.result.computedQuantity); addDetail(entry, 'Service windows add to', tool.result.windowsTotal);
      for (const issue of tool.result.issues || []) entry.append(el('p', '', issue.message));
      entry.append(el('p', 'pending-note', tool.result.calculation));
    }
    const raw = el('details'); raw.append(el('summary', '', 'Exact tool request and response'), el('pre', '', JSON.stringify({ requested: tool.args, returned: tool.result }, null, 2))); entry.append(raw); calls.append(entry);
  } target.append(calls);
  if (result.sourceIds?.length) target.append(el('p', 'pending-note', `Sources retained: ${result.sourceIds.join(' · ')}`));
  if (result.proposal) renderProposedRequest(target, result.proposal);
  target.append(el('p', 'pending-note', `${packet.receipt?.model || 'Muse'} · recorded ${dateLabel(packet.receipt?.recordedAt || availableReview()?.createdAt)}. This saved review is not an approval or a kitchen receipt.`));
  const receipt = el('details', 'recording-receipt'); receipt.append(el('summary', '', 'Recording receipt'));
  for (const request of packet.receipt?.requests || []) receipt.append(el('p', 'receipt-key', `${request.id} · ${request.inputTokens} input / ${request.outputTokens} output tokens`)); target.append(receipt);
}

async function openMuseReview() {
  const descriptor = availableReview(); if (!descriptor || state.busy) return; error(''); setBusy(true);
  try { const packet = await api(`/recorded?id=${encodeURIComponent(descriptor.id)}`); if (packet.mode !== 'recorded-meta' || packet.liveVerified !== true || packet.recorded !== true || !packet.result) throw new Error('A verified recorded Muse review was not available. No authored response has been substituted.'); state.recorded = packet; state.reviewId = descriptor.id; renderMuse(); }
  catch (failure) { error(failure.message); }
  finally { setBusy(false); if (state.recorded) renderMuse(); }
}

function render() { renderTabs(); renderFacts(); renderConversation(); renderQuote(); renderKitchen(); renderActions(); renderLearning(); renderHistory(); renderMuse(); }
$('refresh-button').addEventListener('click', () => loadWorkspace());
$('correction-button').addEventListener('click', () => runAction('correct_pickup_only', { operator: 'Demo operator' }));
$('next-request-button').addEventListener('click', () => { loadWorkspace('direct').then(() => $('conversation-title').scrollIntoView({ block: 'start', behavior: 'auto' })); });
$('muse-button').addEventListener('click', openMuseReview);
loadWorkspace();
