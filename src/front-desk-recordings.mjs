// Recorded live results are reviewed and hash-pinned before this local replay can start.
// This loader makes no model request. A local hash is integrity evidence, not Meta attestation.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  return {
    recordedReviews: structuredClone(recordedReviews),
    recordedReviewProvider: async id => {
      if (!recordedReviews.some(review => review.id === id) || !packets.has(id)) fail();
      return structuredClone(packets.get(id));
    },
    manifest: structuredClone(manifest),
    additionalManifest: structuredClone(additionalManifest),
  };
}
