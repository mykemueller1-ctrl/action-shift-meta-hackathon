// Explicit programmatic live opt-in only; the default browser server never imports/calls this.
// The evaluated adapter is copied byte-for-byte. Its source and model-facing contract hashes
// are recorded here and in fixtures/v4/replay-manifest.json; old adapter/replays stay intact.
import { reviewFrontDesk, getCandidateContract, getCandidateContractHashes } from './front-desk-meta-v4.mjs';

export const SELECTED_FRONT_DESK_PROFILE = Object.freeze({
  model: 'muse-spark-1.3', reasoningEffort: 'max', maxOutputTokens: 12000,
  maxRequests: 3, maxToolCalls: 8, timeoutMs: 120000, maxRequestBytes: 160000,
  adapterSha256: 'f50dab170fe67adbe2627d4eb5af317a9dc873ad686b9d695b90a42716188a44',
  contractSha256: 'cf9b8c3460b7d732f20f89ed98e92aa42e87e7170a5d2d48fdee7d36a35fcdb6',
});
const fail = () => { throw Object.assign(new Error('FRONT_DESK_SELECTED_PROFILE'), { code: 'FRONT_DESK_SELECTED_PROFILE' }); };

export async function reviewSelectedFrontDesk(packet, options = {}) {
  const profile = SELECTED_FRONT_DESK_PROFILE;
  const permitted = ['apiKey', 'fetchImpl', 'lookupFacts', 'checkQuantities', 'beforeRequest', 'onTurn', ...Object.keys(profile)];
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !permitted.includes(key))
    || typeof options.apiKey !== 'string' || !options.apiKey.trim() || typeof options.beforeRequest !== 'function'
    || Object.entries(profile).some(([key, value]) => Object.hasOwn(options, key) && options[key] !== value)
    || getCandidateContractHashes().completeContractSha256 !== profile.contractSha256
    || getCandidateContract().maxRequestBytes !== profile.maxRequestBytes) fail();
  // A caller must provide its authorized key and approved budget gate. No environment-key
  // fallback, retry, model substitution or application action is introduced by this wrapper.
  return reviewFrontDesk(packet, { ...options, model: profile.model, reasoningEffort: profile.reasoningEffort,
    maxOutputTokens: profile.maxOutputTokens, maxRequests: profile.maxRequests, maxToolCalls: profile.maxToolCalls, timeoutMs: profile.timeoutMs });
}
