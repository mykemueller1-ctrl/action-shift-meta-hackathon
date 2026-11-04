// Recorded live results are reviewed and hash-pinned before this local replay can start.
// This loader makes no model request. A local hash is integrity evidence, not Meta attestation.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOptionalV4Recordings } from './front-desk-v4-recordings.mjs';

const fixtureRoot = fileURLToPath(new URL('../fixtures/front-desk/', import.meta.url));
const fail = () => { throw new Error('The reviewed front-desk recordings failed their integrity check.'); };
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const modelInputKeys = ['synthetic', 'restaurantId', 'demoNow', 'message'];

export async function loadFrontDeskRecordings(directory = fixtureRoot) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  let additionalManifest = null;
  try { additionalManifest = JSON.parse(await readFile(path.join(directory, 'v2-manifest.json'), 'utf8')); if (additionalManifest === null) fail(); }
  catch (error) { if (error.code !== 'ENOENT') fail(); }
  const packets = new Map(); const recordedReviews = [];
  async function loadManifest(current, secondary) {
    if (!current || current.schemaVersion !== 1 || current.syntheticOnly !== true || !Array.isArray(current.reviews) || !current.reviews.length) fail();
    if (secondary && (current.reviews.length > 2 || !current.reviews.some(entry => entry?.id === 'case-02')
      || current.reviews.some(entry => !['case-02', 'case-03'].includes(entry?.id)))) fail();
    const visibleCases = new Set();
    for (const entry of current.reviews) {
    if (!entry || typeof entry !== 'object') fail();
    if (!/^[a-z0-9-]{1,64}$/.test(entry.id) || packets.has(entry.id)
      || entry.filename !== entry.id + '.json' || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !['pass', 'pass-with-limitations'].includes(entry.semanticVerdict) || typeof entry.title !== 'string') fail();
    if (secondary && (typeof entry.displayInApp !== 'boolean'
      || (entry.preferred !== undefined && typeof entry.preferred !== 'boolean')
      || (entry.displayInApp && (entry.id !== 'case-02' || entry.caseId !== 'direct'))
      || (entry.preferred === true && !entry.displayInApp))) fail();
    const bytes = await readFile(path.join(directory, entry.filename));
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) fail();
    const packet = JSON.parse(bytes.toString('utf8'));
    if (packet.mode !== 'recorded-meta' || packet.recorded !== true || packet.liveVerified !== true
      || packet.input?.synthetic !== true || packet.receipt?.transport !== 'live'
      || packet.receipt?.model !== 'muse-spark-1.3' || packet.receipt?.store !== false
      || packet.scenarioId !== entry.id || packet.caseId !== entry.caseId
      || packet.evaluation?.semanticReviewStatus !== entry.semanticVerdict
      || !Array.isArray(packet.receipt?.requests) || !packet.receipt.requests.length
      || packet.receipt.requests.some(request => request.status !== 'completed' || typeof request.id !== 'string')) fail();
    if (secondary && (!exact(packet.modelInput, modelInputKeys)
      || !exact(packet.input, [...modelInputKeys, 'scenarioId']) || packet.input.scenarioId !== entry.id
      || modelInputKeys.some(key => packet.modelInput[key] !== packet.input[key])
      || packet.evaluation.scenarioIdExcludedFromModelInput !== true)) fail();
    packets.set(entry.id, packet);
    if (entry.displayInApp === true) {
      if (!['workplace', 'direct', 'reservation', 'recovery'].includes(entry.caseId)
        || visibleCases.has(entry.caseId)) fail();
      visibleCases.add(entry.caseId);
      recordedReviews.push({ id: entry.id, title: entry.title, caseId: entry.caseId, createdAt: packet.receipt.recordedAt,
        ...(secondary && entry.preferred === true ? { preferred: true } : {}) });
    }
    }
  }
  await loadManifest(manifest, false);
  if (additionalManifest !== null) await loadManifest(additionalManifest, true);
  // A deliberately failed model example is separate from the passed-review manifests.
  // The immutable packet stays unchanged; this envelope labels the human recovery path.
  let humanReviewManifest = null;
  try { humanReviewManifest = JSON.parse(await readFile(path.join(directory, 'human-review-manifest.json'), 'utf8')); if (humanReviewManifest === null) fail(); }
  catch (error) { if (error.code !== 'ENOENT') fail(); }
  if (humanReviewManifest !== null) {
    const entry = humanReviewManifest;
    if (!exact(entry, ['schemaVersion', 'syntheticOnly', 'id', 'caseId', 'filename', 'sha256', 'title', 'semanticVerdict', 'reviewNotes', 'completionOnly', 'preferred'])
      || entry.schemaVersion !== 1 || entry.syntheticOnly !== true || entry.id !== 'fresh-01' || entry.caseId !== 'workplace'
      || entry.filename !== '../reasoning-comparison/run-01.json' || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || entry.semanticVerdict !== 'fail' || entry.completionOnly !== true || entry.preferred !== true || packets.has(entry.id)
      || typeof entry.title !== 'string' || !entry.title.trim() || !Array.isArray(entry.reviewNotes) || !entry.reviewNotes.length
      || entry.reviewNotes.some(note => typeof note !== 'string' || !note.trim() || note.length > 1000)) fail();
    const bytes = await readFile(path.join(directory, entry.filename));
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) fail();
    const packet = JSON.parse(bytes.toString('utf8'));
    if (packet.mode !== 'meta-review' || packet.recorded !== true || packet.liveVerified !== true
      || packet.scenarioId !== entry.id || packet.caseId !== entry.caseId || packet.comparisonRunId !== 'run-01'
      || packet.receipt?.transport !== 'live' || packet.receipt.model !== 'muse-spark-1.3' || packet.receipt.store !== false
      || packet.receipt.reasoningEffort !== 'low' || packet.receipt.maxOutputTokens !== 12000
      || !Array.isArray(packet.receipt.requests) || !packet.receipt.requests.length || packet.receipt.requests.some(request => request.status !== 'completed' || typeof request.id !== 'string')
      || !exact(packet.modelInput, modelInputKeys) || !exact(packet.input, [...modelInputKeys, 'scenarioId'])
      || packet.modelInput.synthetic !== true || packet.input.scenarioId !== entry.id || modelInputKeys.some(key => packet.modelInput[key] !== packet.input[key])
      || packet.evaluation?.scenarioIdExcludedFromModelInput !== true || packet.evaluation.semanticReviewStatus !== 'pending'
      || packet.result?.proposal?.destination !== null || packet.result.proposal.fulfillment !== 'pickup') fail();
    const replayReview = { semanticVerdict: entry.semanticVerdict, reviewNotes: structuredClone(entry.reviewNotes), completionOnly: true, sourcePacketSha256: entry.sha256 };
    packets.set(entry.id, { ...packet, replay: true, replayReview });
    recordedReviews.push({ id: entry.id, title: entry.title, caseId: entry.caseId, createdAt: packet.receipt.recordedAt, preferred: true, completionOnly: true, semanticVerdict: 'fail' });
  }
  const v4 = await loadOptionalV4Recordings(path.resolve(directory, '..', 'v4'));
  if (v4) for (const descriptor of v4.recordedReviews) {
    if (packets.has(descriptor.id)) fail();
    if (descriptor.preferred) for (const old of recordedReviews) if (old.caseId === descriptor.caseId) delete old.preferred;
    packets.set(descriptor.id, await v4.recordedReviewProvider(descriptor.id)); recordedReviews.push(structuredClone(descriptor));
  }
  return {
    recordedReviews: structuredClone(recordedReviews),
    recordedReviewProvider: async id => {
      if (!recordedReviews.some(review => review.id === id) || !packets.has(id)) fail();
      return structuredClone(packets.get(id));
    },
    manifest: structuredClone(manifest),
    additionalManifest: structuredClone(additionalManifest),
    humanReviewManifest: structuredClone(humanReviewManifest),
    v4Manifest: v4 ? structuredClone(v4.manifest) : null,
  };
}
