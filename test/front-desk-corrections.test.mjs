import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createFrontDeskDemo } from '../src/front-desk.mjs';
import { createFrontDeskServer } from '../src/front-desk-server.mjs';
import { createFileCorrectionStorage, makePickupCorrection } from '../src/front-desk-corrections.mjs';

const tempRoot = fileURLToPath(new URL('../.local-state/tests/', import.meta.url));
function fixture(t) {
  fs.mkdirSync(tempRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(tempRoot, 'corrections-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(tempRoot) + path.sep));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, filename: path.join(directory, 'corrections.json') };
}
const reopen = filename => createFrontDeskDemo({ correctionStorage: createFileCorrectionStorage({ filePath: filename }) });
function command(store, caseId, action, payload = {}) {
  return store.action({ caseId, expectedVersion: store.getCase(caseId).version, action, payload }).case;
}
function approve(store, caseId) {
  const value = store.getCase(caseId);
  return command(store, caseId, 'approve_quote', { requestVersion: value.requestVersion, quoteId: value.quote.id,
    operator: 'Demo operator', priceAccepted: true, timingAccepted: true, capacityAccepted: true });
}
function acknowledge(store, caseId) {
  const value = store.getCase(caseId);
  return command(store, caseId, 'acknowledge_kitchen', { requestVersion: value.requestVersion, quoteId: value.quote.id });
}
const correction = () => makePickupCorrection({ sequence: 1, restaurantId: 'demo-north', date: '2026-11-04' });

test('reviewed correction survives reopen with exact scope; execution state resets and duplicate application is rejected', t => {
  const { filename } = fixture(t); const first = reopen(filename);
  assert.deepEqual(first.getStatus().correctionStorage, { mode: 'local-json', durable: true, count: 0, revision: 0, loadedCount: 0, caseState: 'memory', casesResetOnRestart: true });
  command(first, 'workplace', 'correct_pickup_only', { operator: 'Demo operator' });
  command(first, 'direct', 'confirm_pickup'); command(first, 'direct', 'prepare_quote'); approve(first, 'direct'); acknowledge(first, 'direct');
  const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['corrections', 'revision', 'schemaVersion']);
  assert.equal(saved.corrections.length, 1); assert.equal(saved.corrections[0].reviewed, true);
  const second = reopen(filename); const facts = second.lookupFacts();
  assert.equal(second.getStatus().correctionStorage.loadedCount, 1);
  assert.deepEqual(facts.corrections, first.lookupFacts().corrections);
  assert.equal(facts.factVersion, first.lookupFacts().factVersion);
  for (const [restaurantId, date, expected] of [['demo-north', '2026-11-04', true], ['demo-south', '2026-11-04', false], ['demo-north', '2026-11-05', false], ['demo-north', '2026-11-03', false]]) {
    assert.equal(second.lookupFacts({ restaurantId, date }).service.pickupOnly, expected);
  }
  const fresh = second.getCase('direct');
  assert.equal(fresh.request.fulfillment, 'delivery'); assert.equal(fresh.approval, null); assert.equal(fresh.quote, null);
  assert.equal(fresh.receipts.length, 0); assert.equal(fresh.commitment, null); assert.equal(fresh.paymentStatus, 'unknown');
  assert.equal(fresh.requestVersion, 2); assert.equal(fresh.history[0].action, 'restore_operator_correction');
  assert.ok(fresh.blockers.some(blocker => blocker.code === 'PICKUP_ONLY'));
  assert.ok(!fresh.allowedActions.includes('correct_pickup_only')); assert.ok(!fresh.allowedActions.includes('approve_quote'));
  assert.throws(() => command(second, 'direct', 'correct_pickup_only', { operator: 'Demo operator' }), error => error.code === 'FRONT_DESK_TRANSITION');
  assert.deepEqual(JSON.parse(fs.readFileSync(filename, 'utf8')), saved);
  assert.equal(reopen(filename).getCase('direct').requestVersion, 2); // Reopening does not multiply retained facts.
});

test('fact change invalidates an acknowledged pickup version while retaining old receipts and requiring fresh approval', t => {
  const { filename } = fixture(t); const store = reopen(filename);
  const old = store.getCase('direct').request;
  const proposal = { ...old, fulfillment: 'pickup', destination: 'Maple Street Kitchen pickup counter', windows: old.windows.map(({ responsibleRole, ...window }) => window) };
  command(store, 'direct', 'apply_request_proposal', { proposal, operator: 'Demo operator' });
  command(store, 'direct', 'prepare_quote'); approve(store, 'direct'); const committed = acknowledge(store, 'direct');
  command(store, 'workplace', 'correct_pickup_only', { operator: 'Demo operator' });
  const changed = store.getCase('direct');
  assert.equal(changed.requestVersion, committed.requestVersion + 1); assert.equal(changed.approval, null); assert.equal(changed.quote, null);
  assert.deepEqual(changed.receipts, committed.receipts); assert.equal(changed.commitment.status, 'change_pending');
  assert.throws(() => command(store, 'direct', 'acknowledge_kitchen', { requestVersion: committed.requestVersion, quoteId: committed.quote.id }), error => error.code === 'FRONT_DESK_STALE_APPROVAL');
  command(store, 'direct', 'prepare_quote'); const approved = approve(store, 'direct');
  assert.notEqual(approved.quote.factVersion, committed.quote.factVersion); assert.notEqual(approved.quote.id, committed.quote.id);
  const updated = acknowledge(store, 'direct');
  assert.equal(updated.receipts.length, 2); assert.equal(updated.commitment.requestVersion, updated.requestVersion);
  assert.equal(updated.receipts[0].requestVersion, committed.requestVersion);
});

test('corrupt, unknown, broad, unreviewed or duplicate retained corrections fail closed at hydration', t => {
  const { filename } = fixture(t);
  const state = () => ({ schemaVersion: 1, revision: 1, corrections: [correction()] });
  const invalid = [
    data => { data.schemaVersion = 2; }, data => { data.unexpected = true; }, data => { data.revision = 2; },
    data => { data.corrections[0].restaurantId = 'private-real-restaurant'; }, data => { data.corrections[0].validFrom = '2026-11-31'; },
    data => { data.corrections[0].validTo = '2026-11-05'; }, data => { data.corrections[0].validFrom = data.corrections[0].validTo = '2026-12-01'; },
    data => { data.corrections[0].reviewed = false; }, data => { data.corrections[0].operator = 'Guest'; },
    data => { data.corrections[0].kind = 'free-food'; }, data => { data.corrections[0].text = 'Delivery approved'; },
    data => { data.corrections[0].id = 'demo-correction-2'; }, data => { data.corrections[0].paid = true; },
    data => { data.corrections.push({ ...correction(), id: 'demo-correction-2' }); data.revision = 2; },
  ];
  for (const alter of invalid) {
    const data = state(); alter(data); const serialized = JSON.stringify(data); fs.writeFileSync(filename, serialized);
    assert.throws(() => reopen(filename), error => error.code === 'FRONT_DESK_CORRECTION_STATE');
    assert.equal(fs.readFileSync(filename, 'utf8'), serialized);
  }
  for (const raw of ['{broken', 'null', '[]', 'x'.repeat(65537)]) {
    fs.writeFileSync(filename, raw); assert.throws(() => reopen(filename), error => error.code === 'FRONT_DESK_CORRECTION_STATE');
  }
});

test('a failed persistence callback rolls back every affected case and reports no successful correction', () => {
  const storage = { mode: 'local-json', durable: true, load: () => [], assertCurrent: () => {}, save: () => { throw Object.assign(new Error('Safe storage failure'), { code: 'FRONT_DESK_PERSISTENCE', status: 503 }); } };
  const store = createFrontDeskDemo({ correctionStorage: storage });
  command(store, 'direct', 'prepare_quote'); approve(store, 'direct');
  const before = store.listCases().map(value => store.getCase(value.id));
  assert.throws(() => command(store, 'workplace', 'correct_pickup_only', { operator: 'Demo operator' }), error => error.code === 'FRONT_DESK_PERSISTENCE');
  assert.deepEqual(store.listCases().map(value => store.getCase(value.id)), before);
  assert.equal(store.lookupFacts().service.pickupOnly, false); assert.equal(store.getStatus().correctionStorage.count, 0);
});

test('atomic write failure leaves previous JSON intact and makes the running store fail closed', t => {
  const { filename, directory } = fixture(t);
  const first = reopen(filename); command(first, 'workplace', 'correct_pickup_only', { operator: 'Demo operator' });
  const before = fs.readFileSync(filename);
  const brokenIo = { ...fs, renameSync: () => { throw Object.assign(new Error('Synthetic rename failure'), { code: 'EACCES' }); } };
  const storage = createFileCorrectionStorage({ filePath: filename, io: brokenIo });
  const next = [...storage.load(), makePickupCorrection({ sequence: 2, restaurantId: 'demo-south', date: '2026-11-04' })];
  assert.throws(() => storage.save(next), error => error.code === 'FRONT_DESK_PERSISTENCE');
  assert.deepEqual(fs.readFileSync(filename), before); assert.deepEqual(fs.readdirSync(directory), ['corrections.json']);
  assert.throws(() => storage.load(), error => error.code === 'FRONT_DESK_PERSISTENCE');
  assert.equal(reopen(filename).getStatus().correctionStorage.count, 1);
});

test('external state changes and concurrent stale stores cannot use old facts or overwrite durable corrections', t => {
  const { filename } = fixture(t); const first = reopen(filename); const stale = reopen(filename);
  command(stale, 'direct', 'prepare_quote'); const old = approve(stale, 'direct');
  command(first, 'workplace', 'correct_pickup_only', { operator: 'Demo operator' });
  for (const read of [() => stale.getStatus(), () => stale.lookupFacts(), () => stale.getCase('direct'), () => stale.listCases()]) assert.throws(read, error => error.code === 'FRONT_DESK_PERSISTENCE');
  assert.throws(() => stale.action({ caseId: 'direct', expectedVersion: old.version, action: 'acknowledge_kitchen', payload: { requestVersion: old.requestVersion, quoteId: old.quote.id } }), error => error.code === 'FRONT_DESK_PERSISTENCE');
  const valid = fs.readFileSync(filename); fs.writeFileSync(filename, '{broken');
  assert.throws(() => first.lookupFacts(), error => error.code === 'FRONT_DESK_CORRECTION_STATE');
  fs.writeFileSync(filename, valid); assert.equal(reopen(filename).lookupFacts().service.pickupOnly, true);
});

test('unavailable exclusive lock rejects the save and does not remove another writer lock', t => {
  const { filename } = fixture(t); const storage = createFileCorrectionStorage({ filePath: filename });
  fs.writeFileSync(`${filename}.lock`, 'other writer');
  assert.throws(() => storage.save([correction()]), error => error.code === 'FRONT_DESK_PERSISTENCE');
  assert.equal(fs.existsSync(filename), false); assert.equal(fs.readFileSync(`${filename}.lock`, 'utf8'), 'other writer');
});

test('public fixture locations cannot be used as correction state', t => {
  const { directory } = fixture(t);
  for (const folder of ['fixtures', 'public']) assert.throws(() => createFileCorrectionStorage({ filePath: path.join(directory, folder, 'corrections.json') }), error => error.code === 'FRONT_DESK_CORRECTION_STATE');
  assert.equal(createFrontDeskDemo().getStatus().correctionStorage.mode, 'memory');
});

test('default HTTP store persists across server restart; durable failure returns 503, never success', async t => {
  const { filename } = fixture(t); const port = 64000 + Math.floor(Math.random() * 700);
  const base = `http://127.0.0.1:${port}`;
  const listen = async server => { server.listen(port, '127.0.0.1'); await once(server, 'listening'); return server; };
  const close = server => new Promise(resolve => server.close(resolve));
  const post = version => fetch(`${base}/api/front-desk/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: 'workplace', expectedVersion: version, action: 'correct_pickup_only', payload: { operator: 'Demo operator' } }) });
  let server = await listen(createFrontDeskServer({ port, correctionFile: filename }));
  try {
    const response = await post(1); assert.equal(response.status, 200); assert.equal((await response.json()).correctionStorage.durable, true);
  } finally { await close(server); }
  server = await listen(createFrontDeskServer({ port, correctionFile: filename }));
  try {
    const status = await (await fetch(`${base}/api/front-desk/status`)).json();
    assert.equal(status.correctionStorage.loadedCount, 1); assert.equal(status.correctionStorage.casesResetOnRestart, true);
    assert.equal((await (await fetch(`${base}/api/front-desk/facts`)).json()).service.pickupOnly, true);
    assert.equal((await post(2)).status, 400);
  } finally { await close(server); }
  const brokenFile = path.join(path.dirname(filename), 'cannot-save.json');
  const io = { ...fs, renameSync: () => { throw new Error('Synthetic local path must never leak'); } };
  const store = createFrontDeskDemo({ correctionStorage: createFileCorrectionStorage({ filePath: brokenFile, io }) });
  server = await listen(createFrontDeskServer({ port, store }));
  try {
    const response = await post(1); assert.equal(response.status, 503);
    const body = await response.json(); assert.equal(body.code, 'FRONT_DESK_PERSISTENCE'); assert.doesNotMatch(JSON.stringify(body), /Synthetic local path/);
    assert.equal(fs.existsSync(brokenFile), false);
    assert.equal((await fetch(`${base}/api/front-desk/status`)).status, 503);
  } finally { await close(server); }
});
