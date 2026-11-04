// All generated gates/packets below are unit-test mocks, never live evaluation evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, cp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOptionalV4Recordings } from '../src/front-desk-v4-recordings.mjs';
import { loadFrontDeskRecordings } from '../src/front-desk-recordings.mjs';
import { createFrontDeskDemo } from '../src/front-desk.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const profile = { armId: 'B', model: 'muse-spark-1.3', reasoningEffort: 'max', maxOutputTokens: 12000,
  adapterSha256: 'f50dab170fe67adbe2627d4eb5af317a9dc873ad686b9d695b90a42716188a44',
  contractSha256: 'cf9b8c3460b7d732f20f89ed98e92aa42e87e7170a5d2d48fdee7d36a35fcdb6',
  protocolSha256: '81003e1586a9f8110ff358f252423d27f69494ea2bf73512d229730c1630c60c' };
async function temporary(t) {
  const parent = path.join(root, '.local-state', 'v4-replay-tests'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'mock-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(parent)); assert.ok(path.basename(directory).startsWith('mock-')); await rm(directory, { recursive: true, force: true }); });
  await mkdir(path.join(directory, 'v4')); return { directory, v4: path.join(directory, 'v4') };
}
async function writeGate(directory, gate, manifest) {
  await save(path.join(directory, 'promotion-gate.json'), gate);
  manifest.gateSha256 = sha(await readFile(path.join(directory, 'promotion-gate.json')));
  await save(path.join(directory, 'replay-manifest.json'), manifest);
}
async function mocks(t) {
  const folders = await temporary(t), directory = folders.v4;
  const gate = { schemaVersion: 1, decision: 'promote-B', ...profile, reviewer: 'Unit-test mock only', reviewedAt: '2026-11-04T18:00:00Z', cases: [] };
  for (let index = 1; index <= 6; index++) {
    const id = `v4-holdout-0${index}`, runId = `v4-run-0${index}`, filename = `${runId}.json`;
    const modelInput = { synthetic: true, restaurantId: 'demo-north', demoNow: '2026-11-04T10:00:00-06:00', message: 'Unit-test synthetic source; no live model request was made.' };
    const packet = { mode: 'meta-review', recorded: true, liveVerified: true, scenarioId: id, v4RunId: runId, v4ArmId: 'B', caseId: 'workplace',
      input: { ...modelInput, scenarioId: id }, modelInput,
      evaluation: { protocolSha256: profile.protocolSha256, scenarioIdExcludedFromModelInput: true, expectedConditionsKeptOutsideInput: true, freshStorePerRun: true, semanticReviewStatus: 'pending-independent-review' },
      receipt: { model: profile.model, transport: 'live', store: false, reasoningEffort: 'max', maxOutputTokens: 12000, recordedAt: gate.reviewedAt,
        requests: [{ id: `resp_unit_mock_${index}`, model: profile.model, reasoningEffort: 'max', maxOutputTokens: 12000, status: 'completed' }] },
      result: { intent: 'human-review', status: 'human-review', summary: 'Unit-test mock result only.', reply: 'No real customer action occurred.', questions: [], sourceIds: [], proposal: null }, tools: [] };
    await save(path.join(directory, filename), packet);
    gate.cases.push({ scenarioId: id, runId, packetFilename: filename, packetSha256: sha(await readFile(path.join(directory, filename))), criticalPass: true, semanticVerdict: 'pass', reviewNotes: [] });
  }
  const manifest = { schemaVersion: 1, syntheticOnly: true, ...profile, gateFilename: 'promotion-gate.json', gateSha256: '',
    reviews: [{ id: 'v4-holdout-01', caseId: 'workplace', title: 'Unit-test replay only', displayInApp: true, preferred: true }] };
  await writeGate(directory, gate, manifest); return { ...folders, gate, manifest };
}

test('an isolated missing selection keeps the optional loader empty; frozen adapter bytes remain unchanged', async t => {
  const { v4 } = await temporary(t); assert.equal(await loadOptionalV4Recordings(v4), null);
  await assert.rejects(access(path.join(v4, 'replay-manifest.json')));
  assert.equal(sha(await readFile(path.join(root, 'src/front-desk-meta-v4.mjs'))), profile.adapterSha256);
});

test('actual selected B records preserve every raw packet and only add the reviewed 11-pizza option without changing V3 default', async () => {
  const loaded = await loadFrontDeskRecordings(); assert.equal(loaded.v4Manifest.armId, 'B'); assert.equal(loaded.recordedReviews.length, 7);
  assert.equal(loaded.recordedReviews.find(item => item.id === 'fresh-01').preferred, true);
  const descriptor = loaded.recordedReviews.find(item => item.id === 'v4-holdout-01'); assert.equal(descriptor.preferred, false);
  assert.equal(descriptor.title, 'Revised crew order · 11 pizzas');
  const gate = await json(path.join(root, 'fixtures/v4/promotion-gate.json')); assert.equal(gate.cases.length, 6);
  for (const entry of gate.cases) {
    const bytes = await readFile(path.join(root, 'fixtures/v4', entry.packetFilename)); assert.equal(sha(bytes), entry.packetSha256);
    const packet = JSON.parse(bytes); assert.equal(packet.evaluation.semanticReviewStatus, 'pending-independent-review'); assert.equal(packet.v4ArmId, 'B');
    if (entry.scenarioId !== descriptor.id) await assert.rejects(loaded.recordedReviewProvider(entry.scenarioId));
  }
  const original = await json(path.join(root, 'fixtures/v4/v4-run-02.json')); const packet = await loaded.recordedReviewProvider(descriptor.id);
  assert.deepEqual(packet.result, original.result); assert.deepEqual(packet.modelInput, original.modelInput); assert.deepEqual(packet.receipt, original.receipt);
  assert.equal(packet.replayReview.semanticVerdict, 'pass'); assert.equal(packet.result.proposal.headlineQuantity, 11);
});

test('actual B proposal quotes 11/$181 with 5/6 windows, then a change holds the earlier promise and needs a new 12/$198 review', async () => {
  const loaded = await loadFrontDeskRecordings(); const packet = await loaded.recordedReviewProvider('v4-holdout-01'); const store = createFrontDeskDemo();
  const action = (name, payload = {}) => store.action({ caseId: 'workplace', expectedVersion: store.getCase('workplace').version, action: name, payload }).case;
  let current = store.applyRecordedProposal({ caseId: 'workplace', expectedVersion: 1, reviewId: 'v4-holdout-01', operator: 'Demo operator' }, packet).case;
  assert.equal(current.request.headlineQuantity, 11); assert.equal(current.request.destination, 'Maple Street Kitchen');
  assert.equal(current.request.date, '2026-11-09'); assert.deepEqual(current.request.windows.map(w => w.items.reduce((sum, item) => sum + item.quantity, 0)), [5, 6]);
  assert.deepEqual(current.proposalSource.originalProposal, packet.result.proposal); assert.equal(current.quote, null); assert.equal(current.approval, null); assert.deepEqual(current.receipts, []);
  current = action('prepare_quote'); assert.equal(current.quote.totalCents, 18100);
  current = action('approve_quote', { operator: 'Demo operator', requestVersion: current.requestVersion, quoteId: current.quote.id, priceAccepted: true, timingAccepted: true, capacityAccepted: true });
  assert.equal(current.receipts.length, 0);
  current = action('acknowledge_kitchen', { requestVersion: current.requestVersion, quoteId: current.quote.id });
  const oldReceipts = structuredClone(current.receipts), oldVersion = current.requestVersion, oldQuote = current.quote.id;
  current = action('revise_request', { change: 'add_one_garden' });
  assert.equal(current.request.headlineQuantity, 12); assert.deepEqual(current.request.windows.map(w => w.items.reduce((sum, item) => sum + item.quantity, 0)), [5, 7]);
  assert.equal(current.quote, null); assert.equal(current.approval, null); assert.equal(current.commitment.status, 'change_pending'); assert.deepEqual(current.receipts, oldReceipts);
  assert.throws(() => action('acknowledge_kitchen', { requestVersion: oldVersion, quoteId: oldQuote }), error => /^FRONT_DESK_/.test(error.code));
  current = action('prepare_quote'); assert.equal(current.quote.totalCents, 19800); assert.equal(current.approval, null);
  current = action('approve_quote', { operator: 'Demo operator', requestVersion: current.requestVersion, quoteId: current.quote.id, priceAccepted: true, timingAccepted: true, capacityAccepted: true });
  current = action('acknowledge_kitchen', { requestVersion: current.requestVersion, quoteId: current.quote.id });
  assert.equal(current.commitment.requestVersion, current.requestVersion); assert.ok(current.receipts.some(receipt => receipt.requestVersion === oldVersion));
  assert.deepEqual(current.proposalSource.originalProposal, packet.result.proposal);
});

test('a separately reviewed six-case mock gate exposes only configured replay and preserves raw output and pending label', async t => {
  const { v4 } = await mocks(t); const loaded = await loadOptionalV4Recordings(v4); const raw = await json(path.join(v4, 'v4-run-01.json'));
  const packet = await loaded.recordedReviewProvider('v4-holdout-01');
  assert.deepEqual(packet.result, raw.result); assert.deepEqual(packet.input, raw.input); assert.deepEqual(packet.receipt, raw.receipt);
  assert.equal(packet.evaluation.semanticReviewStatus, 'pending-independent-review'); assert.equal(packet.replayReview.semanticVerdict, 'pass');
  assert.equal(packet.replayReview.selectionVerified, true); assert.equal(packet.replayReview.armId, 'B');
  loaded.recordedReviews.push({ id: 'v4-holdout-02' }); await assert.rejects(loaded.recordedReviewProvider('v4-holdout-02'));
  packet.result.reply = 'Changed'; assert.notEqual((await loaded.recordedReviewProvider('v4-holdout-01')).result.reply, 'Changed');
});

test('selection is rejected for incomplete six-case gate, critical failure, wrong arm/model/contract or missing qualification notes', async t => {
  for (const mutate of [
    (gate) => { gate.cases.pop(); }, (gate) => { gate.cases[0].criticalPass = false; },
    (gate) => { gate.cases[0].semanticVerdict = 'fail'; }, (gate) => { gate.cases[0].semanticVerdict = 'pass-with-limitations'; },
    (gate) => { gate.decision = 'pending'; }, (gate) => { gate.armId = 'C'; }, (gate) => { gate.model = 'muse-wonder-1.0'; },
    (gate) => { gate.contractSha256 = '0'.repeat(64); }, (gate) => { gate.cases[1] = structuredClone(gate.cases[0]); },
    (_gate, manifest) => { manifest.gateFilename = '../promotion-gate.json'; },
  ]) {
    const { v4, gate, manifest } = await mocks(t); mutate(gate, manifest); await writeGate(v4, gate, manifest);
    await assert.rejects(loadOptionalV4Recordings(v4));
  }
});

test('even recomputed packet hashes cannot substitute another model, case identity, protocol, source or unfinished request', async t => {
  for (const mutate of [
    p => { p.v4ArmId = 'A'; }, p => { p.v4RunId = 'v4-run-99'; }, p => { p.receipt.model = 'muse-wonder-1.0'; },
    p => { p.receipt.requests[0].model = 'muse-wonder-1.0'; }, p => { p.receipt.requests[0].status = 'incomplete'; },
    p => { p.evaluation.protocolSha256 = '0'.repeat(64); }, p => { p.modelInput.message = 'Different source'; },
    p => { p.modelInput.expectedAnswer = 'Injected'; }, p => { p.recorded = false; }, p => { p.input.synthetic = false; },
  ]) {
    const { v4, gate, manifest } = await mocks(t); const filename = path.join(v4, 'v4-run-01.json'); const packet = await json(filename);
    mutate(packet); await save(filename, packet); gate.cases[0].packetSha256 = sha(await readFile(filename)); await writeGate(v4, gate, manifest);
    await assert.rejects(loadOptionalV4Recordings(v4));
  }
});

test('old records remain available when one separately gated mock replay becomes the preferred case', async t => {
  const { directory, v4, gate, manifest } = await mocks(t);
  await cp(path.join(root, 'fixtures', 'front-desk'), path.join(directory, 'front-desk'), { recursive: true });
  await cp(path.join(root, 'fixtures', 'reasoning-comparison'), path.join(directory, 'reasoning-comparison'), { recursive: true });
  gate.cases[0].semanticVerdict = 'pass-with-limitations'; gate.cases[0].reviewNotes = ['Unit-test qualification retained.']; await writeGate(v4, gate, manifest);
  const loaded = await loadFrontDeskRecordings(path.join(directory, 'front-desk'));
  assert.equal(loaded.recordedReviews.length, 7); assert.equal(loaded.recordedReviews.find(item => item.id === 'v4-holdout-01').preferred, true);
  assert.equal(loaded.recordedReviews.find(item => item.id === 'fresh-01').preferred, undefined);
  assert.equal((await loaded.recordedReviewProvider('fresh-01')).replayReview.semanticVerdict, 'fail');
  assert.deepEqual((await loaded.recordedReviewProvider('v4-holdout-01')).replayReview.reviewNotes, ['Unit-test qualification retained.']);
});

test('optional replay reads perform no network operation or model inference', async t => {
  const { v4 } = await mocks(t); const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Network forbidden'); };
  try { const loaded = await loadOptionalV4Recordings(v4); await loaded.recordedReviewProvider('v4-holdout-01'); assert.equal(calls, 0); }
  finally { globalThis.fetch = original; }
});
