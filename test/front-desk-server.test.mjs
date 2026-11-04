import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createFrontDeskServer } from '../src/front-desk-server.mjs';
import { createFrontDeskDemo } from '../src/front-desk.mjs';

test('isolated HTTP demo enforces loopback, same-origin, bounded actions and no inference route', async () => {
  const port = 62000 + Math.floor(Math.random() * 1000);
  const server = createFrontDeskServer({ port }); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  const post = (value, headers = {}) => fetch(`${base}/api/front-desk/action`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  try {
    const response = await fetch(`${base}/api/front-desk/status`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    const status = await response.json(); assert.equal(status.modelCalls, 0); assert.equal(status.mode, 'authored-simulation'); assert.deepEqual(status.recordedReviews, []);
    assert.deepEqual(status.capabilities, { recordedProposalAdoption: false, recordedReplyReview: false });
    const cases = await (await fetch(`${base}/api/front-desk/cases`)).json(); assert.equal(cases.length, 4);
    const command = { caseId: 'workplace', expectedVersion: 1, action: 'clarify_quantity', payload: { quantity: 13 } };
    assert.equal((await post(command, { Origin: 'https://unrelated.example' })).status, 403);
    assert.equal((await post(command, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post(command, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post({ ...command, credential: 'synthetic-placeholder' })).status, 400);
    assert.equal((await post({ ...command, padding: 'x'.repeat(9000) })).status, 413);
    assert.equal((await post(command)).status, 200);
    assert.equal((await post(command)).status, 409);
    assert.equal((await fetch(`${base}/api/front-desk/recorded?id=none`)).status, 404);
    for (const route of ['/src/front-desk.mjs', '/.env', '/api/handoff/brief', '/api/front-desk/run-model']) assert.equal((await fetch(`${base}${route}`)).status, 404);
    const invalidHost = await new Promise((resolve, reject) => { const request = http.get(`${base}/api/front-desk/status`, { headers: { Host: 'unrelated.example' } }, reply => { reply.resume(); resolve(reply.statusCode); }); request.on('error', reject); });
    assert.equal(invalidHost, 403);
    assert.equal((await fetch(`${base}/api/front-desk/facts?restaurantId=demo-south`)).status, 200);
    assert.equal((await fetch(`${base}/api/front-desk/facts?restaurantId=private-restaurant`)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('recorded adoption reads a configured server provider and cannot use a client-supplied review', async () => {
  const port = 63000 + Math.floor(Math.random() * 1000);
  const store = createFrontDeskDemo();
  const request = store.getCase('workplace').request;
  const record = { recorded: true, liveVerified: true, scenarioId: 'synthetic-test-review', caseId: 'workplace', input: { synthetic: true, scenarioId: 'synthetic-test-review', restaurantId: 'demo-north', demoNow: '2026-11-04T10:00:00-06:00', message: 'Synthetic test source with separate food allocations.' }, result: { proposal: { ...request, windows: request.windows.map(({ responsibleRole, ...window }) => window) } }, receipt: { model: 'muse-spark-1.3', transport: 'live', referenceChecksPassed: true, requests: [{ id: 'resp_http_synthetic_test' }] } };
  let reads = 0;
  const server = createFrontDeskServer({ port, store, recordedReviews: [{ id: 'synthetic-test-review' }], recordedReviewProvider: async id => { reads += 1; assert.equal(id, 'synthetic-test-review'); return structuredClone(record); } });
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const post = payload => fetch(`http://127.0.0.1:${port}/api/front-desk/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: 'workplace', expectedVersion: 1, action: 'apply_recorded_proposal', payload }) });
  try {
    assert.equal((await post({ reviewId: 'unknown', operator: 'Demo operator' })).status, 400);
    assert.equal((await post({ reviewId: 'synthetic-test-review', operator: 'Demo operator', review: record })).status, 400);
    assert.equal(reads, 0);
    const response = await post({ reviewId: 'synthetic-test-review', operator: 'Demo operator' });
    assert.equal(response.status, 200); assert.equal(reads, 1);
    const payload = await response.json(); assert.equal(payload.case.proposalSource.sourceVerified, true);
    assert.equal(payload.case.approval, null); assert.equal(payload.case.receipts.length, 0);
    assert.equal(payload.case.request.headlineQuantity, 12); assert.equal(payload.case.quantityCheck.matches, false);
    const review = await (await fetch(`http://127.0.0.1:${port}/api/front-desk/recorded?id=synthetic-test-review`)).json(); assert.deepEqual(review, record);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
