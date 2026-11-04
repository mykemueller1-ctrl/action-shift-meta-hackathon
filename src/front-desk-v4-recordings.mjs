// Optional local replay only. Absence preserves V3; no selection or inference occurs here.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { getCandidateContractHashes } from './front-desk-meta-v4.mjs';

const ADAPTER = 'f50dab170fe67adbe2627d4eb5af317a9dc873ad686b9d695b90a42716188a44';
const CONTRACT = 'cf9b8c3460b7d732f20f89ed98e92aa42e87e7170a5d2d48fdee7d36a35fcdb6';
const PROTOCOL = '81003e1586a9f8110ff358f252423d27f69494ea2bf73512d229730c1630c60c';
const SHA = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => plain(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const assert = condition => { if (!condition) throw new Error('The optional V4 replay failed its selection, review or integrity check.'); };
const safeName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}\.json$/.test(value);
const keys = ['synthetic', 'restaurantId', 'demoNow', 'message'];
const profileKeys = ['armId', 'model', 'reasoningEffort', 'maxOutputTokens', 'adapterSha256', 'contractSha256', 'protocolSha256'];
const profile = value => value.armId === 'B' && value.model === 'muse-spark-1.3' && value.reasoningEffort === 'max'
  && value.maxOutputTokens === 12000 && value.adapterSha256 === ADAPTER && value.contractSha256 === CONTRACT && value.protocolSha256 === PROTOCOL;

async function readPinned(directory, filename, expected) {
  assert(safeName(filename) && SHA.test(expected));
  const bytes = await readFile(path.join(directory, filename)); assert(bytes.length <= 2_000_000 && digest(bytes) === expected);
  return JSON.parse(bytes.toString('utf8'));
}
function validatePacket(packet, reviewed) {
  assert(packet?.mode === 'meta-review' && packet.recorded === true && packet.liveVerified === true
    && packet.scenarioId === reviewed.scenarioId && packet.v4RunId === reviewed.runId && packet.v4ArmId === 'B'
    && [null, 'workplace', 'direct', 'reservation', 'recovery'].includes(packet.caseId)
    && exact(packet.input, [...keys, 'scenarioId']) && exact(packet.modelInput, keys)
    && packet.input.scenarioId === reviewed.scenarioId && packet.input.synthetic === true
    && ['demo-north', 'demo-south'].includes(packet.input.restaurantId) && packet.input.demoNow === '2026-11-04T10:00:00-06:00'
    && typeof packet.input.message === 'string' && packet.input.message.trim() && packet.input.message.length <= 5000
    && keys.every(key => packet.input[key] === packet.modelInput[key])
    && packet.evaluation?.protocolSha256 === PROTOCOL && packet.evaluation.scenarioIdExcludedFromModelInput === true
    && packet.evaluation.expectedConditionsKeptOutsideInput === true && packet.evaluation.freshStorePerRun === true
    && packet.evaluation.semanticReviewStatus === 'pending-independent-review'
    && packet.receipt?.model === 'muse-spark-1.3' && packet.receipt.transport === 'live' && packet.receipt.store === false
    && packet.receipt.reasoningEffort === 'max' && packet.receipt.maxOutputTokens === 12000
    && Array.isArray(packet.receipt.requests) && packet.receipt.requests.length >= 1 && packet.receipt.requests.length <= 3
    && packet.receipt.requests.every(request => request.model === 'muse-spark-1.3' && request.reasoningEffort === 'max'
      && request.maxOutputTokens === 12000 && request.status === 'completed' && typeof request.id === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(request.id))
    && plain(packet.result) && Array.isArray(packet.tools));
}

export async function loadOptionalV4Recordings(directory) {
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(directory, 'replay-manifest.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  assert(exact(manifest, ['schemaVersion', 'syntheticOnly', ...profileKeys, 'gateFilename', 'gateSha256', 'reviews'])
    && manifest.schemaVersion === 1 && manifest.syntheticOnly === true && profile(manifest)
    && manifest.gateFilename === 'promotion-gate.json' && Array.isArray(manifest.reviews) && manifest.reviews.length >= 1 && manifest.reviews.length <= 6);
  assert(digest(await readFile(new URL('./front-desk-meta-v4.mjs', import.meta.url))) === ADAPTER
    && getCandidateContractHashes().completeContractSha256 === CONTRACT);
  const gate = await readPinned(directory, manifest.gateFilename, manifest.gateSha256);
  assert(exact(gate, ['schemaVersion', 'decision', ...profileKeys, 'reviewer', 'reviewedAt', 'cases'])
    && gate.schemaVersion === 1 && gate.decision === 'promote-B' && profile(gate)
    && typeof gate.reviewer === 'string' && gate.reviewer.trim() && gate.reviewer.length <= 160
    && typeof gate.reviewedAt === 'string' && Number.isFinite(Date.parse(gate.reviewedAt))
    && Array.isArray(gate.cases) && gate.cases.length === 6);
  const packets = new Map(), reviewedById = new Map(), runIds = new Set(), filenames = new Set();
  for (const entry of gate.cases) {
    assert(exact(entry, ['scenarioId', 'runId', 'packetFilename', 'packetSha256', 'criticalPass', 'semanticVerdict', 'reviewNotes'])
      && /^v4-holdout-0[1-6]$/.test(entry.scenarioId) && !reviewedById.has(entry.scenarioId)
      && /^v4-run-\d{2}$/.test(entry.runId) && !runIds.has(entry.runId) && !filenames.has(entry.packetFilename)
      && entry.criticalPass === true && ['pass', 'pass-with-limitations'].includes(entry.semanticVerdict)
      && Array.isArray(entry.reviewNotes) && entry.reviewNotes.length <= 20 && entry.reviewNotes.every(note => typeof note === 'string' && note.trim() && note.length <= 2000)
      && (entry.semanticVerdict !== 'pass-with-limitations' || entry.reviewNotes.length > 0));
    const packet = await readPinned(directory, entry.packetFilename, entry.packetSha256); validatePacket(packet, entry);
    packets.set(entry.scenarioId, packet); reviewedById.set(entry.scenarioId, entry); runIds.add(entry.runId); filenames.add(entry.packetFilename);
  }
  const descriptors = [], configured = new Map(), seenCases = new Set();
  for (const entry of manifest.reviews) {
    assert(exact(entry, ['id', 'caseId', 'title', 'displayInApp', 'preferred']) && !configured.has(entry.id)
      && typeof entry.title === 'string' && entry.title.trim() && entry.title.length <= 160
      && typeof entry.displayInApp === 'boolean' && typeof entry.preferred === 'boolean' && (!entry.preferred || entry.displayInApp));
    const packet = packets.get(entry.id), reviewed = reviewedById.get(entry.id);
    assert(packet && packet.caseId === entry.caseId);
    configured.set(entry.id, true);
    if (!entry.displayInApp) continue;
    assert(['workplace', 'direct', 'reservation', 'recovery'].includes(entry.caseId) && packet.input.restaurantId === 'demo-north' && !seenCases.has(entry.caseId));
    seenCases.add(entry.caseId);
    descriptors.push({ ...entry, createdAt: packet.receipt.recordedAt, semanticVerdict: reviewed.semanticVerdict, v4Selected: true, model: packet.receipt.model });
  }
  assert(descriptors.length > 0);
  return {
    manifest: structuredClone(manifest), recordedReviews: structuredClone(descriptors),
    recordedReviewProvider: async id => {
      assert(descriptors.some(entry => entry.id === id)); const packet = packets.get(id), reviewed = reviewedById.get(id);
      return { ...structuredClone(packet), replay: true, replayReview: { selectionVerified: true, armId: 'B', semanticVerdict: reviewed.semanticVerdict, reviewNotes: structuredClone(reviewed.reviewNotes),
        sourcePacketSha256: reviewed.packetSha256, gateSha256: manifest.gateSha256, contractSha256: CONTRACT,
        verification: 'Hash-pinned local selection and six-case review record; not independent provider attestation.' } };
    },
  };
}
