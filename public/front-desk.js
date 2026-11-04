'use strict';

// New event-period UI. Only the same-origin local simulator is contacted.
// Recorded Muse reviews are evidence; no model call or external action runs here.
const API = '/api/front-desk';
const $ = id => document.getElementById(id);
const state = { status: null, cases: [], facts: null, current: null, selected: 'workplace', busy: false, loadToken: 0, recorded: null, appliedReviewId: null, reviewId: null, selectedReviewId: null, scopeCheck: null, completionDraft: null };
const caseNames = { workplace: 'Crew meals', direct: 'The next guest', reservation: 'Reservations', recovery: 'Guest care' };
const statusNames = { requested: 'Needs review', proposal_reviewed: 'Unapproved reviewed draft', clarified: 'Details clarified', quoted: 'Quote ready', operator_approved: 'Operator approved', kitchen_acknowledged: 'Kitchen acknowledged', revision_requested: 'Changes need review', operator_correction_pending: 'Service rule changed', cancellation_requested: 'Cancellation pending', cancelled: 'Released in simulator', reservation_acknowledged: 'Table acknowledged', remedy_offered: 'Remedy offered', remedy_authorized: 'Remedy authorized', remedy_issued: 'Issuance recorded' };
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
  for (const button of document.querySelectorAll('#case-tabs button, #action-controls button, #correction-button, #scope-check-button, #next-request-button, #refresh-button, #muse-button, #muse-review button')) button.disabled = value;
  if (!value && state.current) { renderActions(); renderLearning(); renderMuse(); }
}

async function loadWorkspace(id = state.selected) {
  const token = ++state.loadToken; error(''); setBusy(true);
  try {
    const [status, cases, current] = await Promise.all([api('/status'), api('/cases'), api(`/case?id=${encodeURIComponent(id)}`)]);
    const facts = await api(`/facts?restaurantId=${encodeURIComponent(current.restaurantId)}&date=${encodeURIComponent(current.request.date)}`);
    if (token !== state.loadToken) return;
    if (id !== state.selected) { state.recorded = null; state.reviewId = null; state.selectedReviewId = null; state.appliedReviewId = null; }
    Object.assign(state, { status, cases, current, facts, selected: id, scopeCheck: null, appliedReviewId: current.proposalSource?.reviewId || null });
    if (state.reviewId && !availableReviews().some(review => review.id === state.reviewId)) { state.recorded = null; state.reviewId = null; state.selectedReviewId = null; }
    render();
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
  $('conversation-history').open = !isRecordedPreview();
  $('conversation-history-label').textContent = isRecordedPreview() ? 'Separate authored starter · not this saved guest request' : 'Conversation & retained history';
  const current = state.current; $('conversation-title').textContent = current.id === 'workplace' ? 'A crew meal starts here.' : current.type === 'reservation' ? 'A place at the table.' : current.type === 'recovery' ? 'Care after the order.' : 'The next guest asks.';
  $('case-description').textContent = current.title;
  $('case-status').textContent = statusNames[current.status] || 'Needs operator review'; $('case-status').className = `small-label${current.status.includes('acknowledged') || current.status === 'remedy_issued' ? ' status-complete' : ''}`;
  const feed = $('conversation-feed'); clear(feed);
  for (const message of current.messages || []) {
    const brand = message.channel === 'food-post'; const clarification = message.channel === 'customer-clarification'; const reviewedSource = message.channel === 'model-reviewed-source';
    const article = el('article', `message${reviewedSource ? ' reviewed-source' : brand ? '' : clarification ? ' operator' : ' guest'}`); const meta = el('div', 'message-meta');
    const label = reviewedSource ? 'Source reviewed by Muse · recorded' : brand ? `${state.facts.restaurantName} · authored starter` : clarification ? 'Guest clarification · authored' : message.channel === 'comment' ? 'Guest comment · authored starter' : 'Guest message · authored example';
    const time = el('time', '', clock(message.at)); if (message.at) time.dateTime = message.at;
    meta.append(el('span', '', label), time); article.append(meta, el('p', '', message.text));
    if (reviewedSource) { article.append(el('small', 'source-reference', 'The exact source stays here. Any operator completion is recorded separately beside the unchanged Muse draft.')); const trace = el('details'); trace.append(el('summary', '', 'Source reference'), el('p', 'receipt-key', message.reviewId || 'Reference unavailable'), el('p', 'receipt-key', message.responseId || 'Response reference not supplied'), el('p', 'receipt-key', message.sourceMessageSha256 || 'Source digest not supplied')); article.append(trace); }
    feed.append(article);
  }
  const quantity = current.quantityCheck; const quantityBox = $('quantity-card'); clear(quantityBox); quantityBox.hidden = !quantity || quantity.matches;
  if (quantity && !quantity.matches) { quantityBox.append(el('h4', '', 'One detail changes the whole order.')); const compare = el('div', 'quantity-compare'); const asked = el('div'); asked.append(el('strong', '', quantity.statedQuantity), el('span', '', 'in the headline')); const counted = el('div'); counted.append(el('strong', '', quantity.computedQuantity), el('span', '', 'in the item lines')); compare.append(asked, el('span', '', '≠'), counted); quantityBox.append(compare, el('p', '', `The kitchen windows also total ${quantity.windowsTotal}. Confirm the intended quantity before a quote can move forward.`)); }
  const blockers = $('blockers'); clear(blockers); blockers.hidden = !(current.blockers?.length);
  if (current.blockers?.length) { blockers.append(el('strong', '', 'Before making a commitment')); const list = el('ul'); current.blockers.forEach(blocker => list.append(el('li', '', blocker.message))); blockers.append(list); }
}

function renderPromiseStatus() {
  const current = state.current; const target = $('promise-status'); clear(target); target.hidden = current.request.kind !== 'food'; if (target.hidden) return;
  if (isRecordedPreview()) {
    target.classList.remove('promise-held');
    const request = el('div'); request.append(el('span', 'promise-label', 'Saved guest request · awaiting operator review'), el('strong', '', 'Not yet a working draft'), el('p', '', isCompletionPreview() ? 'Read the source and complete the missing pickup location before using this request.' : 'Read the source and review the saved proposal before using it as an unapproved draft.'));
    const kitchen = el('div'); kitchen.append(el('span', 'promise-label', 'Kitchen commitment · local simulator'), el('strong', '', 'Nothing handed off'), el('p', '', 'Opening a saved model review does not create a quote, approval or kitchen receipt.'));
    target.append(request, kitchen); return;
  }
  const held = current.commitment && (current.commitment.requestVersion !== current.requestVersion || current.commitment.status === 'change_pending');
  const released = current.status === 'cancelled'; const cancelling = current.status === 'cancellation_requested';
  target.classList.toggle('promise-held', Boolean(held || cancelling));
  const request = el('div'); request.append(el('span', 'promise-label', `Current request · v${current.requestVersion}`));
  const requestTitle = released ? 'Released in the simulator' : cancelling ? 'Cancellation still needs acknowledgment' : held ? 'Changed request: promise on hold' : current.approval ? 'Owner reviewed this version' : current.quote ? 'Quote ready for owner review' : current.blockers?.length ? 'Details needed before promising' : 'Unapproved draft';
  request.append(el('strong', '', requestTitle), el('p', '', held ? 'A new quote, owner review and kitchen acknowledgment are required before this change is accepted.' : 'A reply or a quote does not establish kitchen acceptance.'));
  const kitchen = el('div'); kitchen.append(el('span', 'promise-label', 'Kitchen commitment · local simulator'));
  kitchen.append(el('strong', '', released ? 'Release acknowledged' : current.commitment ? `${held || cancelling ? 'Earlier' : 'Acknowledged'} version ${current.commitment.requestVersion}` : 'No acknowledgment yet'));
  kitchen.append(el('p', '', held ? 'The earlier receipt remains visible. It cannot silently approve the changed request.' : current.commitment ? 'The recorded receipt is separate from preparation, fulfillment and payment.' : 'Only a separate simulator receipt records the reviewed handoff.'));
  target.append(request, kitchen);
}

function renderQuote() {
  const current = state.current; $('request-version').textContent = `Request v${current.requestVersion}`; const target = $('quote-content'); clear(target); clear($('approval-content'));
  if (isRecordedPreview()) { $('request-version').textContent = 'Awaiting review'; target.append(el('h4', '', 'Review the saved guest request first.'), el('p', 'section-description', 'The separate authored starter is folded below. No missing detail has been filled and no saved model draft has been adopted.')); return; }
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
  if (isRecordedPreview()) { windows.append(el('p', 'section-description', 'Pickup times and quantities will appear here after the operator reviews and adopts the draft. Separate approval and acknowledgment are still required.')); return; }
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
  clarify_quantity: ['Confirm 13 pizzas', 'primary'], confirm_pickup: ['Record guest’s pickup confirmation', 'primary'], prepare_quote: ['Price this request', 'primary'], approve_quote: ['Approve this version', 'primary'], acknowledge_kitchen: ['Simulate kitchen acknowledgment', 'primary'], revise_request: ['Simulate guest adds 1 garden pizza', 'secondary'], request_cancellation: ['Request cancellation', 'caution'], acknowledge_cancellation: ['Record simulated release', 'primary'], approve_reservation: ['Approve this table request', 'primary'], acknowledge_reservation: ['Simulate table acknowledgment', 'primary'], offer_remedy: ['Offer a $12 remedy', 'primary'], authorize_remedy: ['Authorize the $12 remedy', 'primary'], issue_remedy: ['Record simulated issuance', 'primary']
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
  let target = $('action-controls'); clear(target); const current = state.current; if (!current) return;
  const allowed = new Set(current.allowedActions || []); let approvalButton = null; const checkIds = [];
  const pendingReview = isRecordedPreview();
  const next = isCompletionPreview() ? ['Review the missing pickup location.', 'Muse missed a location that the guest supplied. Read the source, then record an explicit operator completion.']
    : pendingReview ? ['Review the saved crew request.', 'Check the guest’s source beside the unchanged model proposal. Using it as a draft does not approve the order.']
    : current.status === 'cancellation_requested' ? ['Acknowledge the cancellation.', 'The earlier kitchen commitment remains active until release is acknowledged.']
    : allowed.has('approve_quote') ? ['Can the restaurant commit to this version?', 'Check the price, pickup times and capacity below. Your approval covers only this request.']
    : allowed.has('acknowledge_kitchen') ? ['Get the kitchen’s acknowledgment.', 'Operator approval is recorded. The kitchen still needs to acknowledge this exact version.']
    : allowed.has('confirm_pickup') ? ['Does the guest agree to pickup?', 'Today’s service rule changed. A restaurant rule is not the guest’s consent.']
    : allowed.has('clarify_quantity') ? ['Confirm the intended pizza count.', 'The stated total and menu quantities disagree. This authored example includes a guest clarification.']
    : allowed.has('prepare_quote') ? ['Price the current request.', current.commitment ? 'The guest changed the order. The earlier kitchen receipt does not cover this change.' : 'The required details are present. Build a quote from the current menu before approving anything.']
    : current.status === 'kitchen_acknowledged' ? ['The kitchen has this version.', 'Try a guest change to see the earlier promise put on hold until the new version is reviewed.']
    : current.type === 'reservation' ? ['Review the table request.', 'A table acknowledgment stays separate from any food order.']
    : current.type === 'recovery' ? ['Choose the next guest-care step.', 'Keep the no-call preference attached. An offer, approval and issuance are separate steps.']
    : ['Review the current decision.', 'The history below retains the source, prior decisions and receipts.'];
  $('next-decision-title').textContent = next[0]; $('next-decision-description').textContent = next[1];
  if (pendingReview) {
    const button = el('button', 'button primary', state.recorded ? isCompletionPreview() ? 'Complete the missing detail' : 'Review the saved draft' : 'Review the saved guest request'); button.type = 'button'; button.disabled = state.busy;
    button.addEventListener('click', async () => { if (!state.recorded) await openMuseReview(); ($('operator-completion') || $('original-proposal') || $('muse-source'))?.scrollIntoView({ block: 'start', behavior: 'auto' }); });
    target.append(button);
    const alternate = el('details', 'alternative-actions'); alternate.append(el('summary', '', 'Explore the separate authored starter')); target.append(alternate); target = alternate;
  }
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
    Object.assign(state, { facts, cases, status }); if (['apply_recorded_proposal', 'complete_recorded_proposal'].includes(action)) { state.appliedReviewId = state.reviewId; state.completionDraft = null; } render();
    tell(result.eventsAdded?.[0]?.summary || 'The local simulator recorded this step.');
    if (['apply_recorded_proposal', 'complete_recorded_proposal', 'revise_request', 'prepare_quote', 'approve_quote', 'acknowledge_kitchen'].includes(action)) $('promise-status').scrollIntoView({ block: 'start', behavior: 'auto' });
  } catch (failure) { const extra = Array.isArray(failure.blockers) ? ` ${failure.blockers.map(item => item.message).join(' ')}` : ''; error(`${failure.message}${extra}`, failure.status === 409); }
  finally { setBusy(false); }
}

function renderLearning() {
  if (!state.facts || !state.current) return;
  const rule = state.facts.corrections?.find(item => item.kind === 'pickup-only'); const storage = state.status?.correctionStorage;
  $('rule-status').textContent = rule ? 'Reviewed pickup-only correction active' : 'Pickup or delivery in current policy';
  const canCorrect = state.current.allowedActions?.includes('correct_pickup_only');
  $('correction-button').disabled = true; $('correction-button').textContent = rule ? storage?.durable ? 'Reviewed correction saved locally ✓' : 'Correction recorded for this session ✓' : 'Save reviewed correction';
  const review = $('correction-review'); clear(review); review.hidden = Boolean(rule);
  if (!rule) {
    const scope = el('div', 'correction-scope'); addDetail(scope, 'Change', 'Pickup only'); addDetail(scope, 'Restaurant', state.facts.restaurantName); addDetail(scope, 'Applies only on', dateLabel(state.facts.date)); addDetail(scope, 'Reviewing as', 'Demo operator'); review.append(scope);
    const label = el('label', 'correction-consent'); const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'correction-reviewed'; check.disabled = state.busy || !canCorrect;
    check.addEventListener('change', () => { $('correction-button').disabled = state.busy || !canCorrect || !check.checked; });
    label.append(check, el('span', '', `I reviewed pickup only for ${state.facts.restaurantName} on ${dateLabel(state.facts.date)}. Ask the guest before changing delivery to pickup.`)); review.append(label);
  }
  const target = $('learning-content'); clear(target);
  if (!rule) { target.append(el('p', 'learning-empty', 'The current service policy allows delivery or pickup. Record a reviewed correction to see the next guest request retrieve the new rule.')); }
  else {
    const list = el('ol', 'learning-timeline'); const earlier = state.current.history?.find(event => event.action === 'correct_pickup_only');
    const before = el('li'); before.append(el('strong', '', 'Before the correction'), el('span', '', earlier?.before?.request?.fulfillment === 'delivery' ? `The request proposed delivery${earlier.before.request.destination ? ` to ${earlier.before.request.destination}` : ''}. That earlier proposal stays in history.` : rule.previousValue));
    const correction = el('li'); correction.append(el('strong', '', 'The owner changes today’s rule'), el('span', '', 'Pickup only. Confirm that change with the guest before replacing a delivery request.'));
    const after = el('li'); after.append(el('strong', '', 'The next request gets the corrected fact'), el('span', '', 'Open “The next guest.” A delivery request must now pause for pickup confirmation. It cannot reuse an earlier approval.'));
    list.append(before, correction, after); const scope = el('div', 'scope-labels'); scope.append(el('span', '', state.facts.restaurantName), el('span', '', `${dateLabel(rule.validFrom)} only`), el('span', '', `Reviewed by ${rule.operator || 'reviewer not supplied'}`)); target.append(list, scope);
    const proof = el('div', 'correction-proof'); proof.append(el('strong', '', storage?.durable ? 'Saved correction evidence' : 'Current correction evidence')); addDetail(proof, 'Correction reference', rule.id); addDetail(proof, 'Review recorded', rule.reviewed === true ? 'Yes' : 'Not established'); addDetail(proof, 'Scope', `${state.facts.restaurantName} · ${dateLabel(rule.validFrom)}${rule.validTo !== rule.validFrom ? `–${dateLabel(rule.validTo)}` : ' only'}`); target.append(proof);
  }
  if (storage?.durable === true) {
    const memory = el('div', 'memory-status'); memory.append(el('strong', '', 'Reviewed corrections survive a restart.'));
    memory.append(el('p', '', `${storage.count} saved correction${storage.count === 1 ? '' : 's'} · ${storage.loadedCount} loaded at startup · saved revision ${storage.revision}.`));
    if (storage.casesResetOnRestart === true) memory.append(el('p', '', 'Demo conversations, quotes, approvals and kitchen receipts reset on restart. The reviewed restaurant/date corrections remain.')); target.append(memory);
  } else target.append(el('p', 'learning-memory-note', storage ? 'Session-only mode: corrections and case flows reset when this local server restarts.' : 'Correction storage has not been confirmed. No restart-persistence claim is made.'));
  $('scope-check-button').disabled = state.busy || !rule;
  renderScopeProof();
  $('next-request-button').disabled = state.busy;
}

async function checkCorrectionScope() {
  if (state.busy || !state.facts?.corrections?.some(rule => rule.kind === 'pickup-only')) return;
  const restaurantId = state.facts.restaurantId; const date = state.facts.date; const tomorrow = new Date(`${date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const otherRestaurant = restaurantId === 'demo-north' ? 'demo-south' : 'demo-north';
  error(''); setBusy(true);
  try {
    const dates = [{ label: 'Same restaurant · today', restaurantId, date }, { label: 'Same restaurant · tomorrow', restaurantId, date: tomorrow.toISOString().slice(0, 10) }, { label: 'Other restaurant · today', restaurantId: otherRestaurant, date }];
    const results = await Promise.all(dates.map(async scope => ({ label: scope.label, facts: await api(`/facts?restaurantId=${encodeURIComponent(scope.restaurantId)}&date=${encodeURIComponent(scope.date)}`) })));
    state.scopeCheck = { key: `${restaurantId}/${date}`, results }; renderScopeProof();
  } catch (failure) { error(failure.message); }
  finally { setBusy(false); }
}

function renderScopeProof() {
  const target = $('scope-check-results'); clear(target); const proof = state.scopeCheck;
  if (!proof || proof.key !== `${state.facts?.restaurantId}/${state.facts?.date}`) return;
  target.append(el('h4', '', 'Local fact checks · no model call'));
  for (const result of proof.results) {
    const row = el('div', 'scope-proof-row'); const context = el('div'); context.append(el('strong', '', result.label), el('span', '', `${result.facts.restaurantName} · ${dateLabel(result.facts.date)}`)); row.append(context, el('span', `scope-proof-value${result.facts.service.pickupOnly ? ' active' : ''}`, `pickupOnly: ${String(result.facts.service.pickupOnly)}`)); target.append(row);
  }
  target.append(el('p', '', 'These results come from current local restaurant/date lookups. They do not make a model request or change an order.'));
}

function renderHistory() {
  const list = $('history-list'); clear(list);
  if (!state.current.history?.length) { const row = el('li'); row.append(el('strong', '', `Original request v${state.current.requestVersion}`), el('span', '', 'No decisions have been recorded in this case yet.')); list.append(row); }
  for (const event of [...(state.current.history || [])].reverse()) { const row = el('li'); row.append(el('strong', '', `Request v${event.requestVersion} · ${statusNames[event.after?.status] || 'Decision recorded'}`), el('span', '', event.summary), el('small', '', `${clock(event.at)} training clock · local history ${event.version}`)); if (event.before?.quoteId && event.before.quoteId !== event.after?.quoteId) row.append(el('small', '', `Earlier quote retained in history: ${event.before.quoteId}`)); list.append(row); }
}

function availableReviews() { return (state.status?.recordedReviews || []).filter(review => review.caseId === state.selected); }
function availableReview() { const reviews = availableReviews(); return reviews.find(review => review.id === state.selectedReviewId) || reviews.find(review => review.preferred) || reviews[0]; }
function isCompletionPreview() { return availableReview()?.completionOnly === true && !state.current?.proposalSource && state.current?.version === 1; }
function isRecordedPreview() { return isCompletionPreview() || (availableReview()?.v4Selected === true && !state.current?.proposalSource && state.current?.version === 1); }
function syncMuseButton() {
  const review = availableReview(); $('muse-button').disabled = state.busy || !review;
  const reviews = availableReviews(); const selector = $('muse-selector'); clear(selector); $('muse-selector-label').hidden = reviews.length < 2;
  for (const item of reviews) { const option = el('option', '', `${item.title}${item.semanticVerdict === 'fail' ? ' · model failure retained' : item.preferred ? ' · saved example' : ''}`); option.value = item.id; selector.append(option); }
  selector.value = review?.id || ''; selector.disabled = state.busy;
  const completionRecorded = review?.completionOnly && state.current?.proposalSource?.reviewId === review.id && Boolean(state.current.proposalSource.operatorCompletion);
  $('muse-state').textContent = completionRecorded ? 'Original omission · completion recorded' : review?.completionOnly ? 'Operator completion needed' : review ? 'Saved Muse review' : 'Authored example';
  $('muse-description').textContent = completionRecorded ? 'Your human completion is saved separately beside the unchanged original Muse result. The model failure remains on record; completing the draft did not approve the order.' : review?.completionOnly ? 'A real saved Muse result missed a known pickup location. Review the original source and record the human correction. The original failure stays visible.' : review ? 'Open the saved source and draft. Nothing is sent to a guest or kitchen when you read it.' : 'These controls run an authored local example. No saved model review is available for this case.';
}

function proposalClarifications(proposal) {
  const missing = [];
  const quantityIsValid = quantity => Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100;
  const itemsAreValid = items => Array.isArray(items) && items.length > 0 && items.length <= 10 && items.every(item => item && state.facts?.menu?.some(menu => menu.id === item.itemId) && quantityIsValid(item.quantity));
  const suppliedDate = typeof proposal.date === 'string' && /^2026-\d{2}-\d{2}$/.test(proposal.date) && Number.isFinite(Date.parse(`${proposal.date}T00:00:00Z`)) && new Date(`${proposal.date}T00:00:00Z`).toISOString().slice(0, 10) === proposal.date;
  if (!suppliedDate) missing.push('An exact service date');
  if (!quantityIsValid(proposal.headlineQuantity)) missing.push('The intended final pizza count');
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
  const box = el('div', 'reservation-summary'); box.id = 'original-proposal'; box.append(el('h4', '', 'Original Muse draft · unchanged'));
  addDetail(box, 'Date', dateLabel(proposal.date)); addDetail(box, 'Final count', Number.isSafeInteger(proposal.headlineQuantity) ? `${proposal.headlineQuantity} pizzas` : 'Missing from draft'); addDetail(box, 'Service', proposal.fulfillment || 'Missing from draft'); addDetail(box, proposal.fulfillment === 'pickup' ? 'Pickup location' : 'Destination', proposal.destination || 'Missing from draft');
  if (!proposal.items?.length) addDetail(box, 'Menu choices', 'Not supplied');
  for (const item of proposal.items || []) addDetail(box, itemName(item.itemId), Number.isSafeInteger(item.quantity) ? `${item.quantity}` : 'Quantity not supplied');
  if (!proposal.windows?.length) addDetail(box, 'Service windows', 'Not supplied');
  for (const window of proposal.windows || []) addDetail(box, `${proposal.fulfillment === 'pickup' ? 'Pickup' : proposal.fulfillment === 'delivery' ? 'Delivery' : 'Service'} · ${clock(window.readyAt)}`, window.items?.length ? window.items.map(item => `${Number.isSafeInteger(item.quantity) ? item.quantity : 'Quantity not supplied'} ${shortItemName(item.itemId).toLowerCase()}`).join(' · ') : 'Menu choices and quantities not supplied');
  const missing = proposalClarifications(proposal);
  if (missing.length) { const note = el('div', 'blockers'); note.append(el('strong', '', 'Missing in the original model draft')); const list = el('ul'); missing.forEach(detail => list.append(el('li', '', detail))); note.append(list, el('p', 'pending-note', 'The original stays incomplete. A human completion, when supported, is recorded separately below. Unknown pickup allocations still need a guest clarification.')); box.append(note); }
  box.append(el('p', 'pending-note', 'Adopting this draft creates a new request version. It does not approve the price, capacity, timing or kitchen handoff.'));
  if (!missing.length) { const button = el('button', 'button secondary', state.appliedReviewId === state.reviewId ? 'Draft saved · still needs approval' : 'Use this as an unapproved draft'); button.type = 'button'; button.disabled = state.busy || state.appliedReviewId === state.reviewId || ['cancelled', 'cancellation_requested'].includes(state.current.status); button.addEventListener('click', () => runAction('apply_recorded_proposal', { reviewId: state.reviewId, operator: 'Demo operator' })); box.append(button); } parent.append(box);
  renderOperatorCompletion(parent, proposal);
}

function renderOperatorCompletion(parent, proposal) {
  if (!state.status?.capabilities?.recordedProposalCompletion) return;
  const missingDestination = proposal.destination === null && proposal.fulfillment === 'pickup';
  const missingTotal = proposal.headlineQuantity === null;
  if (!missingDestination && !missingTotal) return;
  const panel = el('section', 'operator-completion'); panel.id = 'operator-completion'; panel.setAttribute('aria-labelledby', 'completion-title');
  panel.append(el('p', 'eyebrow', 'HUMAN REVIEW · ORIGINAL RESULT PRESERVED'), el('h4', '', 'Complete only what you can verify'));
  panel.querySelector('h4').id = 'completion-title';
  const saved = state.current.proposalSource?.reviewId === state.reviewId ? state.current.proposalSource.operatorCompletion : null;
  if (saved) {
    panel.classList.add('completion-saved'); panel.append(el('strong', '', 'Operator completion recorded · draft was not approved'));
    for (const change of saved.changes) addDetail(panel, change.field === 'destination' ? 'Pickup location: missing →' : 'Final count: missing →', change.after);
    addDetail(panel, 'Reviewer', saved.operator); panel.append(el('p', '', `Reason: ${saved.reason}`), el('p', 'pending-note', 'The original Muse result above is unchanged. See the current request and kitchen status for later decisions.'));
    const details = el('details'); details.append(el('summary', '', 'Completion audit'), el('p', '', `${dateLabel(saved.reviewedAt)} · ${clock(saved.reviewedAt)}`), el('p', 'receipt-key', saved.responseId)); panel.append(details); parent.append(panel); return;
  }
  panel.append(el('p', '', 'Use the guest’s source above. Enter only the missing detail you have verified, and say why. This does not approve the order.'));
  if (state.completionDraft?.reviewId !== state.reviewId) state.completionDraft = { reviewId: state.reviewId, destination: '', headlineQuantity: '', reason: '', operator: 'Demo operator', reviewed: false };
  const draft = state.completionDraft; const inputs = {};
  function field(id, labelText, value, { type = 'text', maxLength = 160 } = {}) {
    const label = el('label', 'completion-field', labelText); const input = document.createElement(type === 'textarea' ? 'textarea' : 'input'); input.id = id; if (type === 'textarea') input.rows = 3; else input.type = type; input.value = value; input.maxLength = maxLength; input.disabled = state.busy;
    if (type === 'number') { input.min = '1'; input.max = '100'; input.step = '1'; }
    label.htmlFor = id; label.append(input); panel.append(label); return input;
  }
  if (missingDestination) inputs.destination = field('completion-destination', 'Pickup location · blank in original', draft.destination);
  if (missingTotal) inputs.headlineQuantity = field('completion-total', 'Final pizza count · blank in original', draft.headlineQuantity, { type: 'number' });
  const reviewer = field('completion-operator', 'Reviewer · demonstration role, not founder acceptance', draft.operator, { maxLength: 80 });
  reviewer.readOnly = true;
  const reason = field('completion-reason', 'Why is this the correct completion?', draft.reason, { type: 'textarea', maxLength: 600 });
  const consent = el('label', 'reply-consent'); const check = document.createElement('input'); check.id = 'completion-reviewed'; check.type = 'checkbox'; check.checked = draft.reviewed; check.disabled = state.busy;
  consent.append(check, el('span', '', 'I checked the source. These are my edits; this does not approve an order.')); panel.append(consent);
  const blocked = el('p', 'completion-blocked'); blocked.setAttribute('role', 'status');
  const save = el('button', 'button primary', 'Save completed draft · keep unapproved'); save.id = 'complete-proposal-button'; save.type = 'button';
  function sync() {
    const changes = {};
    for (const [key, input] of Object.entries(inputs)) { draft[key] = input.value; changes[key] = key === 'headlineQuantity' ? (input.value === '' ? null : Number(input.value)) : input.value; }
    draft.operator = reviewer.value; draft.reason = reason.value; draft.reviewed = check.checked;
    const missing = proposalClarifications({ ...proposal, ...changes });
    const quantity = changes.headlineQuantity;
    if (missingTotal && Number.isSafeInteger(quantity) && quantity !== (proposal.items || []).reduce((sum, item) => sum + item.quantity, 0)) missing.push('The entered count must match the menu quantities');
    blocked.textContent = missing.length ? `Still needed: ${missing.join('; ')}.` : 'Only the fields you entered will change. Quote and approval remain separate.';
    save.disabled = state.busy || !check.checked || reviewer.value !== 'Demo operator' || !reason.value.trim() || missing.length > 0 || ['cancelled', 'cancellation_requested'].includes(state.current.status);
    return changes;
  }
  for (const input of [...Object.values(inputs), reviewer, reason]) input.addEventListener('input', sync);
  check.addEventListener('change', sync);
  save.addEventListener('click', () => { const changes = sync(); if (!save.disabled) runAction('complete_recorded_proposal', { reviewId: state.reviewId, operator: reviewer.value, changes, reason: reason.value }); });
  panel.append(blocked, save); sync(); parent.append(panel);
}

function renderMuse() {
  syncMuseButton(); const target = $('muse-review'); clear(target); target.hidden = !state.recorded;
  if (!state.recorded) return;
  const packet = state.recorded; const result = packet.result;
  target.append(el('p', 'recorded-label', 'Recorded live Muse review · no new request'));
  if (packet.replayReview?.semanticVerdict === 'fail') {
    const failure = el('div', 'blockers review-limitations'); failure.append(el('strong', '', 'Model failure retained · operator review needed'));
    failure.append(el('p', '', 'Muse left the named pickup location out of the draft. This failed its acceptance check. The human completion below does not change that result.'));
    const details = el('details'); details.append(el('summary', '', 'Independent review notes')); for (const note of packet.replayReview.reviewNotes || []) details.append(el('p', '', note)); failure.append(details); target.append(failure);
  }
  if ((packet.replayReview?.semanticVerdict || packet.evaluation?.semanticReviewStatus) === 'pass-with-limitations') {
    const limitations = el('div', 'blockers review-limitations'); limitations.append(el('strong', '', 'Independent review: passed with limitations'));
    const notes = el('ul'); for (const note of packet.replayReview?.reviewNotes || packet.evaluation?.reviewNotes || []) notes.append(el('li', '', note)); limitations.append(notes);
    limitations.append(el('p', 'pending-note', 'This is the original saved model response. An operator must resolve these limitations before customer use. No draft reply has been sent.')); target.append(limitations);
  }
  const modelInput = packet.modelInput || packet.input;
  const input = el('details', 'recorded-input'); input.open = true; input.id = 'muse-source'; input.append(el('summary', '', 'Source reviewed by Muse'), el('p', '', modelInput?.message || 'The recorded request was not supplied.'));
  input.append(el('small', '', 'This is the complete synthetic message supplied for this saved review. The authored starter conversation above is a separate source.'));
  const fullInput = el('details'); fullInput.append(el('summary', '', packet.modelInput ? 'Full exact model input' : 'Recorded input envelope · legacy record'), el('pre', '', JSON.stringify(modelInput || {}, null, 2))); input.append(fullInput); target.append(input);
  if (result.summary) target.append(el('p', '', result.summary));
  if (result.proposal) renderProposedRequest(target, result.proposal);
  if (result.reply) { const reply = el('details', 'original-model-draft'); reply.append(el('summary', '', 'Original recorded draft reply · not sent'));
    reply.append(el('p', 'draft-use-note', packet.evaluation?.semanticReviewStatus === 'pass-with-limitations' ? 'Not actionable as written. Resolve the review limitations before customer use. This text did not route a task, contact a guest or execute an action.' : 'Saved model text for operator review. This reply has not been sent and does not execute an action.'), el('p', '', result.reply)); target.append(reply); }
  renderReplyEditor(target, packet);
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
  target.append(el('p', 'pending-note', `${packet.receipt?.model || 'Muse'} · recorded ${dateLabel(packet.receipt?.recordedAt || availableReview()?.createdAt)}. This saved review is not an approval or a kitchen receipt.`));
  const receipt = el('details', 'recording-receipt'); receipt.append(el('summary', '', 'Recording receipt'));
  for (const request of packet.receipt?.requests || []) receipt.append(el('p', 'receipt-key', `${request.id} · ${request.inputTokens} input / ${request.outputTokens} output tokens`)); target.append(receipt);
}

function renderReplyEditor(parent, packet) {
  const descriptor = availableReview();
  if (!state.status?.capabilities?.recordedReplyReview || descriptor?.id !== state.reviewId || descriptor.caseId !== state.current.id || !packet.result.reply) return;
  const saved = state.current.reviewedReply?.reviewId === state.reviewId ? state.current.reviewedReply : null;
  const panel = el('details', 'reply-editor'); panel.open = Boolean(saved); panel.append(el('summary', '', saved ? 'Operator-reviewed reply · remains unsent' : 'Review an unsent reply'));
  panel.append(el('p', 'pending-note', 'Reviewing as Demo operator. Saving records the wording and its source; it does not route a task, send a message or contact the guest.'));
  const label = el('label', 'reply-editor-label', 'Reviewed reply text'); const field = document.createElement('textarea'); field.id = 'reviewed-reply-text'; field.rows = 7; field.maxLength = 2500; field.value = saved?.text || packet.result.reply; field.disabled = state.busy; label.htmlFor = field.id;
  const count = el('small', 'reply-count'); const warning = el('p', 'reply-warning'); const reviewed = el('label', 'reply-consent'); const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = state.busy;
  reviewed.append(check, el('span', '', 'I reviewed this wording. It does not claim an action that has not happened.'));
  const save = el('button', 'button secondary', 'Save reviewed reply · keep unsent'); save.type = 'button';
  const sync = () => {
    const text = field.value.trim(); const unsupportedRouting = packet.evaluation?.reviewNotes?.some(note => /flagged/i.test(note)) && /(?:I['’]ve|I have) flagged/i.test(text);
    count.textContent = `${field.value.length} / 2,500 characters`; warning.hidden = !unsupportedRouting;
    warning.textContent = unsupportedRouting ? 'The review identified “I’ve flagged” as unsupported. Remove that claim before saving; no routing action is recorded here.' : '';
    save.disabled = state.busy || !check.checked || text.length < 1 || text.length > 2500 || Boolean(unsupportedRouting);
  };
  field.addEventListener('input', sync); check.addEventListener('change', sync);
  save.addEventListener('click', () => { sync(); if (!save.disabled) runAction('review_recorded_reply', { reviewId: state.reviewId, operator: 'Demo operator', text: field.value.trim() }); });
  panel.append(label, field, count, warning, reviewed, save);
  if (saved) { const receipt = el('div', 'reply-review-receipt'); receipt.append(el('strong', '', saved.status === 'reviewed-unsent' && saved.sent === false ? 'Review saved · no message sent' : 'Review state needs verification'), el('p', '', `${saved.operator} · ${dateLabel(saved.reviewedAt)} · ${clock(saved.reviewedAt)}`), el('p', '', saved.text), el('small', '', `Recorded source: ${saved.reviewId}. No delivery or routing receipt is established.`)); panel.append(receipt); }
  sync(); parent.append(panel);
}

async function openMuseReview() {
  const descriptor = availableReview(); if (!descriptor || state.busy) return; error(''); setBusy(true);
  try { const packet = await api(`/recorded?id=${encodeURIComponent(descriptor.id)}`); const selectedV4 = descriptor.v4Selected === true && packet.replay === true && packet.replayReview?.selectionVerified === true && packet.replayReview.armId === 'B' && ['pass', 'pass-with-limitations'].includes(packet.replayReview.semanticVerdict) && packet.receipt?.model === 'muse-spark-1.3'; if (!(packet.mode === 'recorded-meta' || (packet.mode === 'meta-review' && (selectedV4 || (packet.replayReview?.completionOnly === true && packet.replayReview.semanticVerdict === 'fail')))) || packet.liveVerified !== true || packet.recorded !== true || !packet.result) throw new Error('A verified recorded Muse review was not available. No authored response has been substituted.'); state.recorded = packet; state.reviewId = descriptor.id; state.selectedReviewId = descriptor.id; renderMuse(); }
  catch (failure) { error(failure.message); }
  finally { setBusy(false); if (state.recorded) renderMuse(); }
}

function render() { renderTabs(); renderFacts(); renderConversation(); renderPromiseStatus(); renderQuote(); renderKitchen(); renderActions(); renderLearning(); renderHistory(); renderMuse(); }
$('refresh-button').addEventListener('click', () => loadWorkspace());
$('correction-button').addEventListener('click', () => { if ($('correction-reviewed')?.checked) runAction('correct_pickup_only', { operator: 'Demo operator' }); });
$('next-request-button').addEventListener('click', () => { loadWorkspace('direct').then(() => $('conversation-title').scrollIntoView({ block: 'start', behavior: 'auto' })); });
$('muse-button').addEventListener('click', openMuseReview);
$('muse-selector').addEventListener('change', () => { state.selectedReviewId = $('muse-selector').value; state.recorded = null; state.reviewId = null; render(); });
$('scope-check-button').addEventListener('click', checkCorrectionScope);
loadWorkspace();
