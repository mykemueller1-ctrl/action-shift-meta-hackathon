// Bounded local persistence for reviewed synthetic service corrections only.
// Cases, customer conversations, approvals and receipts are never stored here.
import * as fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CORRECTION_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local-state/operator-corrections.json');
const MAX_BYTES = 65536;
const correctionText = 'Reviewed fictional operator correction: pickup only on this date; ask the customer before changing delivery to pickup.';
const previousValue = 'Delivery or pickup available under the base demo service policy.';
const newValue = 'Pickup only on the specified restaurant/date.';
const keys = ['id', 'kind', 'restaurantId', 'validFrom', 'validTo', 'operator', 'at', 'reviewed', 'text', 'previousValue', 'newValue', 'simulated'];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function failure(code = 'FRONT_DESK_PERSISTENCE') {
  return Object.assign(new Error(code === 'FRONT_DESK_CORRECTION_STATE'
    ? 'The local correction state is invalid. Startup stopped; no corrections were discarded.'
    : 'The reviewed correction state could not be safely read or saved. Reload only after resolving local storage.'), { code, status: 503 });
}
function validDate(date) {
  return typeof date === 'string' && /^2026-11-(0[1-9]|[12][0-9]|30)$/.test(date);
}
export function makePickupCorrection({ sequence, restaurantId, date }) {
  const value = { id: `demo-correction-${sequence}`, kind: 'pickup-only', restaurantId, validFrom: date, validTo: date,
    operator: 'Demo operator', at: '2026-11-04T10:00:00-06:00', reviewed: true, text: correctionText, previousValue, newValue, simulated: true };
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 60 || !['demo-north', 'demo-south'].includes(restaurantId) || !validDate(date)) throw failure('FRONT_DESK_CORRECTION_STATE');
  return value;
}
export function validateCorrections(value) {
  if (!Array.isArray(value) || value.length > 60) throw failure('FRONT_DESK_CORRECTION_STATE');
  const scopes = new Set();
  for (const [index, rule] of value.entries()) {
    if (!plain(rule) || Object.keys(rule).length !== keys.length || keys.some(key => !Object.hasOwn(rule, key))) throw failure('FRONT_DESK_CORRECTION_STATE');
    const expected = makePickupCorrection({ sequence: index + 1, restaurantId: rule.restaurantId, date: rule.validFrom });
    if (keys.some(key => rule[key] !== expected[key])) throw failure('FRONT_DESK_CORRECTION_STATE');
    const scope = `${rule.restaurantId}/${rule.validFrom}`;
    if (scopes.has(scope)) throw failure('FRONT_DESK_CORRECTION_STATE');
    scopes.add(scope);
  }
  return structuredClone(value);
}

export function createFileCorrectionStorage({ filePath = DEFAULT_CORRECTION_FILE, io = fs } = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.extname(filePath) !== '.json'
    || path.normalize(filePath).split(path.sep).some(part => ['fixtures', 'public'].includes(part.toLowerCase()))) throw failure('FRONT_DESK_CORRECTION_STATE');
  const filename = path.resolve(filePath);
  let poisoned = false;
  function readState() {
    let bytes;
    try {
      const stat = io.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw failure('FRONT_DESK_CORRECTION_STATE');
      bytes = io.readFileSync(filename);
      if (bytes.length > MAX_BYTES) throw failure('FRONT_DESK_CORRECTION_STATE');
    } catch (error) {
      if (error.code === 'ENOENT') return { fingerprint: null, corrections: [] };
      if (error.code === 'FRONT_DESK_CORRECTION_STATE') throw error;
      throw failure();
    }
    let state;
    try { state = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw failure('FRONT_DESK_CORRECTION_STATE'); }
    if (!plain(state) || Object.keys(state).length !== 3 || state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision)
      || state.revision !== state.corrections?.length) throw failure('FRONT_DESK_CORRECTION_STATE');
    return { fingerprint: digest(bytes), corrections: validateCorrections(state.corrections) };
  }
  let current = readState();
  function assertCurrent() {
    if (poisoned) throw failure();
    const observed = readState();
    if (observed.fingerprint !== current.fingerprint) throw failure();
  }
  function save(value) {
    const corrections = validateCorrections(value);
    if (corrections.length !== current.corrections.length + 1
      || JSON.stringify(corrections.slice(0, -1)) !== JSON.stringify(current.corrections)) throw failure('FRONT_DESK_CORRECTION_STATE');
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: corrections.length, corrections }, null, 2) + '\n');
    const lockPath = `${filename}.lock`; const tempPath = `${filename}.${randomUUID()}.tmp`;
    let lock; let temp; let wrote = false; let error = null;
    try {
      io.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
      lock = io.openSync(lockPath, 'wx', 0o600);
      assertCurrent();
      temp = io.openSync(tempPath, 'wx', 0o600);
      io.writeFileSync(temp, bytes); io.fsyncSync(temp); io.closeSync(temp); temp = undefined;
      io.renameSync(tempPath, filename); wrote = true;
    } catch { error = failure(); }
    finally {
      if (temp !== undefined) { try { io.closeSync(temp); } catch { error = failure(); } }
      if (!wrote) { try { io.unlinkSync(tempPath); } catch (caught) { if (caught.code !== 'ENOENT') error = failure(); } }
      if (lock !== undefined) {
        try { io.closeSync(lock); io.unlinkSync(lockPath); } catch { error = failure(); }
      }
    }
    if (error) { poisoned = true; throw error; }
    current = { fingerprint: digest(bytes), corrections: structuredClone(corrections) };
  }
  return Object.freeze({ mode: 'local-json', durable: true,
    load: () => { assertCurrent(); return structuredClone(current.corrections); }, assertCurrent, save });
}
