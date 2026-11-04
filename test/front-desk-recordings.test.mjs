import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrontDeskRecordings } from '../src/front-desk-recordings.mjs';
import { mkdir } from 'node:fs/promises';

const fixtureRoot = fileURLToPath(new URL('../fixtures/front-desk/', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function temporaryFixtures(t) {
  const parent = fileURLToPath(new URL('../.local-state/recording-tests/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'front-desk-recordings-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(parent));
    assert.ok(path.basename(resolved).startsWith('front-desk-recordings-'));
    await rm(resolved, { recursive: true, force: true });
  });
  await cp(fixtureRoot, directory, { recursive: true });
  return directory;
}
async function editPacketAndUpdateLocalHash(directory, mutate) {
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = await json(manifestPath);
  const entry = manifest.reviews.find(item => item.id === 'offer-and-count');
  const packetPath = path.join(directory, entry.filename);
  const packet = await json(packetPath);
  mutate(packet, entry);
  await save(packetPath, packet);
  entry.sha256 = sha256(await readFile(packetPath));
  await save(manifestPath, manifest);
}

test('all real fixture bytes match the manifest and retain reviewed limitations and failures', async () => {
  const loaded = await loadFrontDeskRecordings();
  assert.equal(loaded.manifest.reviews.length, 10);
  assert.equal(loaded.recordedReviews.length, 4 + (loaded.additionalManifest?.reviews.filter(entry => entry.displayInApp).length || 0));
  let passed = 0; let total = 0;
  for (const entry of loaded.manifest.reviews) {
    const bytes = await readFile(path.join(fixtureRoot, entry.filename));
    assert.equal(sha256(bytes), entry.sha256);
    const packet = JSON.parse(bytes);
    assert.equal(packet.scenarioId, entry.id);
    assert.equal(packet.caseId, entry.caseId);
    assert.equal(packet.input.synthetic, true);
    assert.equal(packet.evaluation.semanticReviewStatus, entry.semanticVerdict);
    assert.equal(packet.evaluation.reviewer, 'Independent Codex agent');
    assert.equal(packet.evaluation.founderAcceptance, 'unverified');
    assert.ok(packet.evaluation.reviewNotes.length > 0);
    passed += packet.evaluation.mechanicalPassed;
    total += packet.evaluation.mechanicalTotal;
  }
  assert.equal(passed, 101);
  assert.equal(total, 103, 'Original mechanical failures must remain in the pinned evidence.');
  assert.equal(loaded.manifest.reviews.filter(item => item.semanticVerdict === 'pass-with-limitations').length, 5);
  const correction = await loaded.recordedReviewProvider('pickup-correction');
  assert.equal(correction.result.proposal.fulfillment, null);
  assert.equal(correction.evaluation.mechanicalPassed, 11);
  assert.equal(correction.evaluation.mechanicalTotal, 12);
});

// These secondary packets are local unit-test copies, not additional inference evidence.
async function mockSecondary(directory) {
  const source = await json(path.join(directory, 'offer-and-count.json'));
  const manifest = { schemaVersion: 1, syntheticOnly: true, caseSetVersion: 'unit-test-only', reviews: [] };
  for (const [id, caseId] of [['case-02', 'direct'], ['case-03', 'recovery']]) {
    const packet = structuredClone(source); packet.scenarioId = id; packet.caseId = caseId; packet.input.scenarioId = id;
    const { synthetic, restaurantId, demoNow, message } = packet.input;
    packet.modelInput = { synthetic, restaurantId, demoNow, message };
    packet.evaluation.scenarioIdExcludedFromModelInput = true;
    packet.evaluation.semanticReviewStatus = 'pass';
    const filename = `${id}.json`; await save(path.join(directory, filename), packet);
    manifest.reviews.push({ id, title: `Unit-test secondary ${id}`, caseId, filename, sha256: sha256(await readFile(path.join(directory, filename))),
      semanticVerdict: 'pass', displayInApp: id === 'case-02', ...(id === 'case-02' ? { preferred: true } : {}) });
  }
  await save(path.join(directory, 'v2-manifest.json'), manifest);
  return manifest;
}

test('secondary manifest is optional, while a present malformed or null manifest stops replay', async t => {
  const directory = await temporaryFixtures(t); const filename = path.join(directory, 'v2-manifest.json');
  await rm(filename, { force: true });
  const old = await loadFrontDeskRecordings(directory);
  assert.equal(old.additionalManifest, null); assert.equal(old.manifest.reviews.length, 10); assert.equal(old.recordedReviews.length, 4);
  for (const contents of ['null', '{broken', '[]', '{}', 'false']) {
    await writeFile(filename, contents);
    await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
  }
});

test('mock secondary merges one preferred direct review while retaining the original direct recording', async t => {
  const directory = await temporaryFixtures(t); const mock = await mockSecondary(directory);
  const loaded = await loadFrontDeskRecordings(directory);
  assert.equal(loaded.manifest.reviews.length, 10); assert.deepEqual(loaded.additionalManifest, mock);
  assert.equal(loaded.recordedReviews.length, 5);
  const direct = loaded.recordedReviews.filter(entry => entry.caseId === 'direct');
  assert.deepEqual(direct.map(entry => entry.id), ['pickup-correction', 'case-02']);
  assert.equal(direct[0].preferred, undefined); assert.equal(direct[1].preferred, true);
  assert.equal((await loaded.recordedReviewProvider('case-02')).modelInput.synthetic, true);
  assert.equal((await loaded.recordedReviewProvider('pickup-correction')).result.proposal.fulfillment, null);
  for (const id of ['case-01', 'case-03', 'other-restaurant']) await assert.rejects(loaded.recordedReviewProvider(id));
  loaded.recordedReviews.push({ id: 'case-01', caseId: 'workplace', preferred: true });
  loaded.recordedReviews.push({ id: 'case-03', caseId: 'recovery' });
  loaded.additionalManifest.reviews.find(entry => entry.id === 'case-03').displayInApp = true;
  await assert.rejects(loaded.recordedReviewProvider('case-01'));
  await assert.rejects(loaded.recordedReviewProvider('case-03'));
  const packet = await loaded.recordedReviewProvider('case-02'); packet.modelInput.message = 'mutated';
  assert.notEqual((await loaded.recordedReviewProvider('case-02')).modelInput.message, 'mutated');
});

test('mock secondary permits only reviewed case-02 and case-03 with an approved verdict on displayable case-02', async t => {
  for (const mutate of [
    manifest => { manifest.reviews.shift(); },
    manifest => { manifest.reviews[0].id = 'pickup-correction'; manifest.reviews[0].filename = 'pickup-correction.json'; },
    manifest => { manifest.reviews[1].id = 'case-02'; },
    manifest => { manifest.reviews[1].id = 'case-01'; manifest.reviews[1].filename = 'case-01.json'; },
    manifest => { manifest.reviews[1].displayInApp = true; },
    manifest => { manifest.reviews[1].preferred = true; },
    manifest => { manifest.reviews[0].preferred = 'true'; },
    manifest => { manifest.reviews[0].caseId = 'workplace'; },
    manifest => { manifest.reviews[0].semanticVerdict = 'fail'; },
    manifest => { manifest.reviews[0].filename = '../case-02.json'; },
  ]) {
    const directory = await temporaryFixtures(t); const manifest = await mockSecondary(directory); mutate(manifest);
    await save(path.join(directory, 'v2-manifest.json'), manifest);
    await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
  }
});

test('pinned v2 preserves reviewed limitations and model input while failed case-01 stays outside replay', async () => {
  const loaded = await loadFrontDeskRecordings();
  assert.deepEqual(loaded.additionalManifest.reviews.map(entry => entry.id).sort(), ['case-02', 'case-03']);
  assert.equal(loaded.recordedReviews.length, 5);
  const descriptor = loaded.recordedReviews.find(entry => entry.id === 'case-02');
  assert.equal(descriptor.caseId, 'direct'); assert.equal(descriptor.preferred, true);
  const packet = await loaded.recordedReviewProvider('case-02');
  assert.equal(packet.evaluation.semanticReviewStatus, 'pass-with-limitations');
  assert.equal(packet.evaluation.scenarioIdExcludedFromModelInput, true);
  assert.equal(packet.result.proposal.fulfillment, 'delivery');
  assert.deepEqual(Object.keys(packet.modelInput).sort(), ['demoNow', 'message', 'restaurantId', 'synthetic']);
  const { scenarioId, ...modelInput } = packet.input;
  assert.equal(scenarioId, 'case-02'); assert.deepEqual(packet.modelInput, modelInput);
  for (const entry of loaded.additionalManifest.reviews) assert.equal(sha256(await readFile(path.join(fixtureRoot, entry.filename))), entry.sha256);
  for (const id of ['case-01', 'case-03', 'other-restaurant']) await assert.rejects(loaded.recordedReviewProvider(id));
});

test('mock secondary model input must have exactly four fields and match the source even after its hash is recomputed', async t => {
  for (const mutate of [
    packet => { delete packet.modelInput; },
    packet => { packet.modelInput.scenarioId = packet.scenarioId; },
    packet => { packet.modelInput.message = 'Changed reviewed source.'; },
    packet => { packet.modelInput.restaurantId = 'demo-south'; },
    packet => { packet.modelInput.demoNow = '2026-11-05T10:00:00-06:00'; },
    packet => { packet.input.scenarioId = 'another-case'; },
    packet => { packet.input.expectedAnswer = 'not allowed'; },
    packet => { delete packet.evaluation.scenarioIdExcludedFromModelInput; },
    packet => { packet.evaluation.scenarioIdExcludedFromModelInput = false; },
  ]) {
    const directory = await temporaryFixtures(t); const manifest = await mockSecondary(directory);
    const entry = manifest.reviews.find(value => value.id === 'case-02'); const filename = path.join(directory, entry.filename);
    const packet = await json(filename); mutate(packet); await save(filename, packet);
    entry.sha256 = sha256(await readFile(filename)); await save(path.join(directory, 'v2-manifest.json'), manifest);
    await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
  }
});

test('mock secondary fixture changes fail integrity and preferred defaults to absent unless explicitly true', async t => {
  const directory = await temporaryFixtures(t); const manifest = await mockSecondary(directory);
  delete manifest.reviews[0].preferred; await save(path.join(directory, 'v2-manifest.json'), manifest);
  const loaded = await loadFrontDeskRecordings(directory);
  assert.equal(loaded.recordedReviews.find(entry => entry.id === 'case-02').preferred, undefined);
  const filename = path.join(directory, 'case-02.json'); const packet = await json(filename);
  packet.result.reply = 'Modified mock result.'; await save(filename, packet);
  await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
});

test('replay loads and reads without credentials or any fetch request', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.MODEL_API_KEY;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error('Network forbidden in local replay test'); };
  delete process.env.MODEL_API_KEY;
  try {
    const loaded = await loadFrontDeskRecordings();
    const packet = await loaded.recordedReviewProvider('offer-and-count');
    assert.equal(packet.mode, 'recorded-meta');
    assert.equal(packet.recorded, true);
    assert.equal(packet.receipt.transport, 'live', 'This marks the historical recording, not a new request.');
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = previousKey;
  }
});

test('provider returns isolated copies and refuses records not configured for this UI', async () => {
  const loaded = await loadFrontDeskRecordings();
  const first = await loaded.recordedReviewProvider('offer-and-count');
  first.result.proposal.items[0].quantity = 99;
  first.input.restaurantId = 'demo-south';
  first.evaluation.reviewNotes.push('Invented review note');
  const second = await loaded.recordedReviewProvider('offer-and-count');
  assert.equal(second.result.proposal.items[0].quantity, 6);
  assert.equal(second.input.restaurantId, 'demo-north');
  assert.ok(!second.evaluation.reviewNotes.includes('Invented review note'));
  await assert.rejects(loaded.recordedReviewProvider('other-restaurant'));
  await assert.rejects(loaded.recordedReviewProvider('not-recorded'));
});

test('mutating returned descriptors cannot expand the provider allowlist', async () => {
  const loaded = await loadFrontDeskRecordings();
  loaded.recordedReviews.push({ id: 'other-restaurant', caseId: 'direct' });
  await assert.rejects(loaded.recordedReviewProvider('other-restaurant'));
});

test('a changed fixture or incorrect manifest hash is rejected', async t => {
  const directory = await temporaryFixtures(t);
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = await json(manifestPath);
  manifest.reviews[0].sha256 = '0'.repeat(64);
  await save(manifestPath, manifest);
  await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
  manifest.reviews[0].sha256 = sha256(await readFile(path.join(directory, manifest.reviews[0].filename)));
  await save(manifestPath, manifest);
  const packetPath = path.join(directory, manifest.reviews[0].filename);
  const packet = await json(packetPath);
  packet.result.reply = 'Changed response must not be accepted with the old hash.';
  await save(packetPath, packet);
  await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
});

test('a recalculated hash cannot bypass scenario, case or reviewed-verdict binding', async t => {
  for (const mutate of [
    packet => { packet.caseId = 'reservation'; },
    packet => { packet.scenarioId = 'table-request'; },
    packet => { packet.evaluation.semanticReviewStatus = 'not-reviewed'; },
    packet => { packet.recorded = false; },
    packet => { packet.receipt.requests[0].status = 'incomplete'; },
  ]) {
    const directory = await temporaryFixtures(t);
    await editPacketAndUpdateLocalHash(directory, mutate);
    await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
  }
});

test('manifest paths cannot escape the fixture directory', async t => {
  const directory = await temporaryFixtures(t);
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = await json(manifestPath);
  manifest.reviews[0].filename = '../offer-and-count.json';
  await save(manifestPath, manifest);
  await assert.rejects(loadFrontDeskRecordings(directory), /integrity check/);
});
