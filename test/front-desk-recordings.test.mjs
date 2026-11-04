import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrontDeskRecordings } from '../src/front-desk-recordings.mjs';

const fixtureRoot = fileURLToPath(new URL('../fixtures/front-desk/', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function temporaryFixtures(t) {
  const parent = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(parent, 'front-desk-recordings-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), parent);
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
  assert.equal(loaded.recordedReviews.length, 4);
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
