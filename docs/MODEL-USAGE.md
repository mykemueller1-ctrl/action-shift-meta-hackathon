# Reproduce a model review

The default app starts in authored simulation and offers saved model replays. Loading a replay needs no API key and makes no new model request.

The included demonstration uses saved results and local simulation. Its browser journey and local tests do not require new paid inference. See [validation](VALIDATION.md) for the separate engineering checks and model evaluations, with their retained limitations.

A developer can run a new review with an authorized Meta account and a key supplied to the Node process. Keep MODEL_API_KEY in the server environment or a local secret manager. Never put the key in browser code, a fixture, a public file or a chat.

The example below reuses one of the original synthetic messages with the v2 adapter. It is not one of the three new independent cases and does not recreate the original evaluation conditions. Expected answers and review criteria are never passed to Muse. The only available tools retrieve fictional restaurant facts and calculate quantities. The result remains a proposal.

The v2 adapter transports only `synthetic`, `restaurantId`, `demoNow` and `message`. Its internal packet still includes a local `scenarioId` for tracing. `frontDeskModelInput` removes that identifier before the request is sent. The returned `modelInput` records the exact four fields sent. The original ten recordings retain their historical five field input, including descriptive scenario IDs.

Save this example as a local script at the project root. It is not part of the default server. Set FRONT_DESK_LIVE_OPT_IN=yes only when you intend to make a new paid request with your own authorized key.

~~~javascript
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { reviewFrontDesk, frontDeskModelInput } from './src/front-desk-meta.mjs';
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
const { synthetic, restaurantId, demoNow, message } = selected.input;
const input = {
  synthetic, scenarioId: 'local-review-01', restaurantId, demoNow, message,
};
const transportedInput = frontDeskModelInput(input);
if (Object.hasOwn(transportedInput, 'scenarioId')) {
  throw new Error('Local trace metadata must not enter model input.');
}

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

For a correction scenario, apply its explicit synthetic setup action before calling the model. To test persistence, construct a store using `createFileCorrectionStorage` from `src/front-desk-corrections.mjs`, save the correction, then construct fresh storage and store instances using the same file. Verify the loaded correction and restaurant/date controls before inference. A rule merely held in the original process does not prove restart persistence. Keep the state file out of published files.

The three new independent cases used opaque local IDs and a frozen expectation file outside model input. Each ran once with a limit of three requests. Together they used eight requests and retained 37 of 39 mechanical checks, with one semantic pass, one pass with limitations and one failure. There were no retries. These results are separate from the original ten cases. The [v2 evaluation](../fixtures/front-desk/v2-evaluation.json) retains the frozen cases and assessments, including the [failed result](../fixtures/front-desk/case-01.json). The [v2 manifest](../fixtures/front-desk/v2-manifest.json) distinguishes which reviewed records may be replayed. Replay selection does not remove a failed case from the evidence.

Four later [supplemental controls](../fixtures/front-desk/supplemental-evaluation.json) used the unchanged adapter and another frozen expectation set. Each ran once, for twelve requests and 61 of 62 mechanical checks. Independent review recorded two passes, one qualified pass and one failure. The explicit pickup destination still dropped from a structured result. Both restaurant/date scope controls passed. All four raw packets are retained as evidence only, with final review in the separate evaluation file. They are not additional app replays or scenes in the recorded demonstration, and they do not replace earlier results.

The app retains the original recordings and qualified delivery example. V3 also exposes one explicitly failed comparison result for a separate human completion demonstration. Its raw packet and failure remain unchanged. A person can complete a null pickup location or null final total, with a demonstration reviewer role and reason, before normal quote review. The app cannot invent allocations or pickup consent. Its delivery path retains requested delivery and requires explicit guest consent before switching to pickup. A reply may be edited and saved as reviewed and unsent.

The [six reasoning comparison runs](../fixtures/reasoning-comparison/README.md) used 18 requests, two fresh low/high pairs and two known regression probes. Both fresh pairs tied on critical outcomes. Only one known probe passed, under a larger output cap than its historical run. The promotion gate failed. The released adapter therefore retains its original low effort and output limit. No model call was needed for the V3 operator workflow. The newly demonstrated human completion is not an improvement to the model evaluation.

Do not put setup commands, expected classifications, window answers or semantic review criteria into the model message. Preserve every run and miss, without selecting a preferred rerun.

Inspect the returned text, questions, proposal and tool trace. A passing source check does not prove that the reply is correct or that an action happened. Save failures and limitations. Do not replace them with authored output and call it a live result.

The adapter uses the [Responses protocol](https://dev.meta.ai/docs/protocols/responses), [function tools](https://dev.meta.ai/docs/tool-calling), structured output and store:false. Each function call is checked before the application runs it. The model cannot invoke quote approval, kitchen acknowledgment, cancellation, payment or remedy actions.
