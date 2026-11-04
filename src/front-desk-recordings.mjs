// Recorded live results are reviewed and hash-pinned before this local replay can start.
// This loader makes no model request. A local hash is integrity evidence, not Meta attestation.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureRoot = fileURLToPath(new URL('../fixtures/front-desk/', import.meta.url));
const fail = () => { throw new Error('The reviewed front-desk recordings failed their integrity check.'); };

export async function loadFrontDeskRecordings(directory = fixtureRoot) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.syntheticOnly !== true || !Array.isArray(manifest.reviews) || !manifest.reviews.length) fail();
  const packets = new Map(); const recordedReviews = [];
  for (const entry of manifest.reviews) {
    if (!/^[a-z0-9-]{1,64}$/.test(entry.id) || packets.has(entry.id)
      || entry.filename !== entry.id + '.json' || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !['pass', 'pass-with-limitations'].includes(entry.semanticVerdict) || typeof entry.title !== 'string') fail();
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
    packets.set(entry.id, packet);
    if (entry.displayInApp === true) {
      if (!['workplace', 'direct', 'reservation', 'recovery'].includes(entry.caseId)
        || recordedReviews.some(review => review.caseId === entry.caseId)) fail();
      recordedReviews.push({ id: entry.id, title: entry.title, caseId: entry.caseId, createdAt: packet.receipt.recordedAt });
    }
  }
  return {
    recordedReviews: structuredClone(recordedReviews),
    recordedReviewProvider: async id => {
      if (!recordedReviews.some(review => review.id === id) || !packets.has(id)) fail();
      return structuredClone(packets.get(id));
    },
    manifest: structuredClone(manifest),
  };
}
