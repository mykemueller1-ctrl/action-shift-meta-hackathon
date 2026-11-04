# Reproduce a model review

The default app replays saved results. It does not need an API key and does not start a new model request.

A developer can run a new review with an authorized Meta account and a key supplied to the Node process. Keep MODEL_API_KEY in the server environment or a local secret manager. Never put the key in browser code, a fixture, a public file or a chat.

The example below uses one of the frozen synthetic cases. Expected answers and review criteria are never passed to Muse. The only available tools retrieve fictional restaurant facts and calculate quantities. The result remains a proposal.

Save this example as a local script at the project root. It is not part of the default server. Set FRONT_DESK_LIVE_OPT_IN=yes only when you intend to make a new paid request with your own authorized key.

~~~javascript
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { reviewFrontDesk } from './src/front-desk-meta.mjs';
import { createFrontDeskDemo } from './src/front-desk.mjs';

if (process.env.FRONT_DESK_LIVE_OPT_IN !== 'yes') {
  throw new Error('Explicit live review opt in is required.');
}
if (!process.env.MODEL_API_KEY) throw new Error('A server side key is required.');

const evaluation = JSON.parse(
  await readFile('./fixtures/front-desk/evaluation.json', 'utf8')
);
const selected = evaluation.predeclaredCases.find(
  value => value.id === 'offer-and-count'
);
const store = createFrontDeskDemo();
const { synthetic, scenarioId, restaurantId, demoNow, message } = selected.input;
const input = { synthetic, scenarioId, restaurantId, demoNow, message };

let requests = 0;
let reservedUsd = 0;
const result = await reviewFrontDesk(input, {
  apiKey: process.env.MODEL_API_KEY,
  lookupFacts: store.lookupFacts,
  checkQuantities: store.checkQuantities,
  maxRequests: 4,
  maxToolCalls: 8,
  timeoutMs: 90000,
  beforeRequest: async ({ requestBytes, maxOutputTokens }) => {
    const reserve = (requestBytes + 2048) * 1.25e-6
      + maxOutputTokens * 4.25e-6;
    if (requests >= 4 || reservedUsd + reserve > 0.25) {
      throw new Error('This example reached its local request or cost limit.');
    }
    requests += 1;
    reservedUsd += reserve;
  },
});

await mkdir('./work', { recursive: true });
await writeFile(
  './work/new-model-review.json',
  JSON.stringify(result, null, 2),
  { flag: 'wx' }
);
console.log('Saved a model proposal for review. No operational action ran.');
~~~

The sample budget bounds this process only. It is not an account spending cap and does not carry across restarts. Its conservative token reserve uses the Standard model rates of $1.25 per million input tokens and $4.25 per million output tokens. Check the [current Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits) before a new run. An unknown request outcome can still incur usage.

For a correction scenario, apply its explicit synthetic setup action to a fresh local store before calling the model. Do not put setup commands, expected classifications or expected conflict answers into the model message.

Inspect the returned text, questions, proposal and tool trace. A passing source check does not prove that the reply is correct or that an action happened. Save failures and limitations. Do not replace them with authored output and call it a live result.

The adapter uses the [Responses protocol](https://dev.meta.ai/docs/protocols/responses), [function tools](https://dev.meta.ai/docs/tool-calling), structured output and store:false. Each function call is checked before the application runs it. The model cannot invoke quote approval, kitchen acknowledgment, cancellation, payment or remedy actions.
