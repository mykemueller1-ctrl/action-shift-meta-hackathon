import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTED_FRONT_DESK_PROFILE as profile, reviewSelectedFrontDesk } from '../src/front-desk-selected-profile.mjs';
const input = { synthetic: true, scenarioId: 'selected-profile-unit', restaurantId: 'demo-north', demoNow: '2026-11-04T10:00:00-06:00', message: 'Unit-test source only.' };
const result = { intent: 'human-review', status: 'human-review', summary: 'The restaurant needs to review the request.', reply: 'Please wait for restaurant review.', questions: [], sourceIds: [], proposal: null };
const final = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result) }] };
const response = output => new Response(JSON.stringify({ id: 'resp_mock_selected', model: 'muse-spark-1.3', status: 'completed', usage: { input_tokens: 20, output_tokens: 30 }, output }));
const base = { apiKey: 'unit-test-only-selected-key', beforeRequest: async () => {}, lookupFacts: async () => ({ sources: [] }), checkQuantities: async () => ({}) };
test('selected wrapper sends the evaluated Spark max profile and budget metadata without changing model contract', async () => {
  let body, details; const receipt = await reviewSelectedFrontDesk(input, { ...base, beforeRequest: async value => { details = value; }, fetchImpl: async (_url, init) => { assert.ok(details, 'budget gate ran before transport'); body = JSON.parse(init.body); return response([final]); } });
  assert.equal(body.model, 'muse-spark-1.3'); assert.equal(body.reasoning.effort, 'max'); assert.equal(body.max_output_tokens, 12000);
  assert.equal(details.model, profile.model); assert.equal(details.reasoningEffort, 'max'); assert.equal(details.maxOutputTokens, 12000);
  assert.ok(details.requestBytes <= profile.maxRequestBytes); assert.equal(profile.timeoutMs, 120000);
  assert.equal(receipt.receipt.model, profile.model); assert.equal(receipt.liveVerified, false); assert.equal(receipt.receipt.transport, 'mocked');
  assert.ok(!JSON.stringify(receipt).includes(base.apiKey)); assert.ok(!JSON.stringify(body).includes(input.scenarioId));
});
test('selected wrapper rejects conflicting settings, missing explicit key/budget and unknown options before transport', async () => {
  let calls = 0; const options = { ...base, fetchImpl: async () => { calls++; return response([final]); } };
  for (const override of [{ model: 'muse-wonder-1.0' }, { reasoningEffort: 'low' }, { maxOutputTokens: 5000 }, { maxRequests: 4 }, { maxToolCalls: 9 }, { timeoutMs: 90000 }, { maxRequestBytes: 200000 }, { contractSha256: 'changed' }, { apiKey: '' }, { beforeRequest: undefined }, { unknown: true }]) {
    await assert.rejects(reviewSelectedFrontDesk(input, { ...options, ...override }), { code: 'FRONT_DESK_SELECTED_PROFILE' });
  }
  assert.equal(calls, 0);
});
test('selected wrapper enforces three requests with no retry and refuses a nine-tool batch before execution', async () => {
  let calls = 0;
  const call = id => ({ type: 'function_call', name: 'lookup_restaurant_facts', call_id: id, arguments: JSON.stringify({ date: '2026-11-04', topics: ['menu'] }) });
  await assert.rejects(reviewSelectedFrontDesk(input, { ...base, fetchImpl: async () => response([call(`call_${++calls}`)]) }), { code: 'FRONT_DESK_REQUEST_LIMIT' });
  assert.equal(calls, 3);
  let toolExecutions = 0;
  await assert.rejects(reviewSelectedFrontDesk(input, { ...base, lookupFacts: async () => { toolExecutions++; return {}; }, fetchImpl: async () => response(Array.from({ length: 9 }, (_, index) => call(`call_${index}`))) }), { code: 'FRONT_DESK_TOOL_LIMIT' });
  assert.equal(toolExecutions, 0);
});
