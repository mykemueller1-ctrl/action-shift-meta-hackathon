// Isolated November 4 front-desk demo. Loopback only; no model or external requests.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFrontDeskDemo } from './front-desk.mjs';
import { createFileCorrectionStorage, DEFAULT_CORRECTION_FILE } from './front-desk-corrections.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = new Map([
  ['/', ['front-desk.html', 'text/html; charset=utf-8']],
  ['/front-desk', ['front-desk.html', 'text/html; charset=utf-8']],
  ['/front-desk.html', ['front-desk.html', 'text/html; charset=utf-8']],
  ['/front-desk.js', ['front-desk.js', 'text/javascript; charset=utf-8']],
  ['/front-desk.css', ['front-desk.css', 'text/css; charset=utf-8']],
]);
const headers = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const MAX_BYTES = 8192;
function answer(res, status, payload) { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); }
async function bodyJson(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) { const error = new Error('Request is too large.'); error.code = 'FRONT_DESK_BODY'; error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Send valid JSON.'), { code: 'FRONT_DESK_JSON', status: 400 }); }
}

export function createFrontDeskServer({ port = 4330, store, correctionFile = DEFAULT_CORRECTION_FILE, recordedReviews = [], getRecordedReview, recordedReviewProvider } = {}) {
  getRecordedReview = recordedReviewProvider || getRecordedReview;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Select a loopback port from 1024 to 65535.');
  if (!Array.isArray(recordedReviews) || (getRecordedReview !== undefined && typeof getRecordedReview !== 'function')) throw new Error('Invalid local recorded-review configuration.');
  store ||= createFrontDeskDemo({ correctionStorage: createFileCorrectionStorage({ filePath: correctionFile }) });
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts].map(host => `http://${host}`));
  const server = http.createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host)) return answer(res, 403, { code: 'FRONT_DESK_HOST', error: 'Loopback host required.' });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (req.method === 'GET') {
        if (assets.has(url.pathname)) {
          const [filename, type] = assets.get(url.pathname);
          const bytes = await readFile(path.join(root, 'public', filename));
          res.writeHead(200, { ...headers, 'Content-Type': type }); res.end(bytes); return;
        }
        if (url.pathname === '/api/front-desk/status') return answer(res, 200, { ...store.getStatus(), recordedReviews: structuredClone(recordedReviews),
          capabilities: { recordedProposalAdoption: Boolean(getRecordedReview), recordedReplyReview: Boolean(getRecordedReview) } });
        if (url.pathname === '/api/front-desk/facts') return answer(res, 200, store.lookupFacts({ restaurantId: url.searchParams.get('restaurantId') || undefined, date: url.searchParams.get('date') || undefined, topics: url.searchParams.has('topics') ? url.searchParams.get('topics').split(',') : undefined }));
        if (url.pathname === '/api/front-desk/cases') return answer(res, 200, store.listCases());
        if (url.pathname === '/api/front-desk/case') return answer(res, 200, store.getCase(url.searchParams.get('id') || 'workplace'));
        if (url.pathname === '/api/front-desk/recorded' && getRecordedReview) {
          const id = url.searchParams.get('id');
          if (!recordedReviews.some(review => review.id === id)) return answer(res, 404, { error: 'No validated recorded review is configured for this ID.' });
          return answer(res, 200, await getRecordedReview(id));
        }
        return answer(res, 404, { error: 'Not found.' });
      }
      if (req.method !== 'POST' || url.pathname !== '/api/front-desk/action') return answer(res, 404, { error: 'Not found.' });
      if ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') return answer(res, 403, { code: 'FRONT_DESK_ORIGIN', error: 'Same origin required.' });
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) return answer(res, 415, { code: 'FRONT_DESK_CONTENT', error: 'Send application/json.' });
      if (Number(req.headers['content-length'] || 0) > MAX_BYTES) { req.resume(); return answer(res, 413, { code: 'FRONT_DESK_BODY', error: 'Request is too large.' }); }
      const body = await bodyJson(req);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 4 || !['caseId', 'expectedVersion', 'action', 'payload'].every(key => Object.hasOwn(body, key))) return answer(res, 400, { code: 'FRONT_DESK_INPUT', error: 'Supply caseId, expectedVersion, action and payload only.' });
      if (['apply_recorded_proposal', 'review_recorded_reply'].includes(body.action)) {
        const reply = body.action === 'review_recorded_reply';
        if (!getRecordedReview || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload) || Object.keys(body.payload).length !== (reply ? 3 : 2)
          || !Object.keys(body.payload).every(key => ['reviewId', 'operator', ...(reply ? ['text'] : [])].includes(key))
          || body.payload.operator !== 'Demo operator' || typeof body.payload.reviewId !== 'string' || !recordedReviews.some(review => review.id === body.payload.reviewId)) return answer(res, 400, { code: 'FRONT_DESK_RECORD', error: 'Choose a configured server-bound recorded result and explicitly review it.' });
        const review = await getRecordedReview(body.payload.reviewId);
        return answer(res, 200, store[reply ? 'reviewRecordedReply' : 'applyRecordedProposal']({ caseId: body.caseId, expectedVersion: body.expectedVersion, ...body.payload }, review));
      }
      return answer(res, 200, store.action(body));
    } catch (error) {
      if (res.writableEnded) return;
      const safe = typeof error?.code === 'string' && /^FRONT_DESK_[A-Z_]+$/.test(error.code) && [400, 404, 409, 413, 503].includes(error.status);
      answer(res, safe ? error.status : 500, safe ? { code: error.code, error: error.message, ...(error.blockers ? { blockers: error.blockers } : {}) } : { code: 'FRONT_DESK_LOCAL_FAILURE', error: 'The local demo request failed.' });
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5_000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
  const port = Number(process.env.FRONT_DESK_PORT || 4330);
  const server = createFrontDeskServer({ port, correctionFile: process.env.FRONT_DESK_CORRECTIONS_FILE || DEFAULT_CORRECTION_FILE });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'The local front-desk port is already in use.' : 'The local front-desk server could not start.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Front Desk: http://127.0.0.1:${port}/front-desk\nAuthored synthetic tool simulation. No model or external request is made.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch {
    console.error('The local correction state or server configuration could not be loaded. Startup stopped; no corrections were discarded.');
    process.exitCode = 1;
  }
}
