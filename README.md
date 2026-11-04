# Action Shift

**The guest changed the order. Which version is the kitchen making?**

The food and labor are real costs when a team makes the wrong version. Action Shift keeps the guest’s request, the restaurant’s decision and the kitchen’s version together. The idea comes from Myke Mueller, operator of Community Tap & Pizza in Fort Dodge, Iowa, and founder of Never86’d.

In this standalone event prototype, Muse reads a fictional meal request and checks dated restaurant facts. Code checks the counts, price and version. A person reviews the promise before a local kitchen simulator acknowledges it. A later guest change stops the old approval from covering the new request.

The V3 operator workflow puts the next decision first. A person can complete a missing pickup location or final total in a recorded proposal, with a demonstration reviewer role and reason, while the original model result stays intact. This creates an unapproved draft. Price, timing and capacity still need a separate review. Unknown item allocations remain blocked. The operational records here are authored fiction, not records from Myke’s restaurant. See [validation](docs/VALIDATION.md) for the final checks and limits.

V4 adds one separately reviewed saved request: **Revised crew order · 11 pizzas**. The clarified Spark instructions kept the pickup site and revised count in the order, while still asking about genuinely missing details. All six targeted cases passed independent review; the original instructions passed three and Wonder passed one. This small comparison supports this bounded change, not a general reliability rate. The original failed example and the video remain unchanged. [Read every result and limitation](fixtures/v4-evaluation/README.md).

## Run locally

Install Node 22 or later. The authored simulation and included recorded replay need no package installation, API key or external service.

```powershell
node src/front-desk-demo.mjs
```

Open http://127.0.0.1:4330/front-desk. Windows users can also run `start-action-shift.cmd`. Stop the server with Ctrl+C.

Run the included tests:

```powershell
node --test test/*.test.mjs
```

The equivalent npm commands are `npm start` and `npm test`. To run authored simulation without loading saved model results, use `node src/front-desk-server.mjs` or `npm run authored`. Tests use mocked model transports and local HTTP servers. They make no paid inference calls.

The app saves reviewed synthetic restaurant corrections in `.local-state/operator-corrections.json`. Cases, conversations, approvals and simulated receipts reset on restart. Corrections do not. A separate demonstration can use a fresh absolute JSON path through `FRONT_DESK_CORRECTIONS_FILE`. Keep that file outside `public` and `fixtures`. Invalid state stops startup instead of silently discarding a rule. The actual restart and scoped reload have been verified. See [architecture](docs/ARCHITECTURE.md) for the storage boundary.

## Follow one request

Start with the workplace meal and inspect the exact saved Muse input. The demonstrated revision totals twelve pizzas in two pickup windows. Muse got those quantities right but omitted the named pickup location. Read the original request, enter that location and record the reason. The original failed result remains available beside the separately completed draft. Then prepare a quote from the fictional menu, review price, timing and capacity, and record a simulated acknowledgment for each service window.

A later guest change creates a new version. The old receipt stays visible. The new version needs its own review and acknowledgment. A dated operator correction can make this restaurant pickup only for that day. The next request reads that correction. Another restaurant and another date retain their own facts. Persisting that rule does not give the guest’s consent to switch from delivery to pickup.

Table reservations and service recovery are separate examples. A table request does not become a food order. An offered remedy does not become an issued remedy. A no call request remains attached.

## What ran and what is simulated

The front desk starts in authored simulation mode. It makes no model request at startup and sends no messages, bookings, orders or payments. A separate Muse Spark 1.3 adapter can retrieve fictional facts and check quantities through local tools. Its answer is a proposal for human review.

A recorded model review is available only when a validated synthetic response and its pinned loader are included and configured. A replay is labeled as recorded. Loading it does not call the model. Adopting its proposal does not approve a quote or acknowledge a kitchen order.

The original evaluation covers ten synthetic cases and 28 model requests. It records 101 of 103 mechanical checks passing, with the misses and wording limitations retained. Those inputs included descriptive scenario IDs. They are historical evidence, not a blind evaluation or a general accuracy claim. The twelve original JSON files, including their evaluation and manifest, remain byte identical to v1.

For v2, three fresh cases and their expectations were independently authored and frozen before execution. Their opaque IDs and expected results stayed outside model input. They ran once each, using eight requests, and passed 37 of 39 mechanical checks. Independent agent review recorded one pass, one pass with limitations and one failure. The failed revision correctly derived item totals and window allocations but left the headline quantity null and unnecessarily asked the guest to confirm the revised total. Both mechanical misses concern that same missing headline. All three saved results remain available: [failed revision](fixtures/front-desk/case-01.json), [qualified delivery request](fixtures/front-desk/case-02.json) and [recovery](fixtures/front-desk/case-03.json). See the [complete v2 evaluation](fixtures/front-desk/v2-evaluation.json), [validation](docs/VALIDATION.md) and [model reproduction](docs/MODEL-USAGE.md).

Four [supplemental cases](fixtures/front-desk/supplemental-evaluation.json) then ran once each against the unchanged adapter. Twelve requests produced 61 of 62 mechanical checks: two semantic passes, one qualified pass and one failure. The explicit revised total was retained, but the named pickup location was again absent from the structured proposal. The missing allocation case asked the right questions while also omitting that location. Both restored rule scope controls passed. All four records are evidence only, outside the app replay and video. They do not replace either earlier evaluation.

Browser review stopped the server, started a new process and confirmed that the correction loaded. Case flows reset. The next request preserved delivery and stayed blocked from quoting until explicit authored guest consent changed it to pickup. Another restaurant and the next date were unaffected.

The browser also showed the exact recorded input retained with its adopted proposal and history. An operator corrected the qualified reply wording and saved it as reviewed and unsent while the original remained visible. V3 adds narrow human completion for a null pickup destination or null final total. It is bound to the recorded source and current case version, retains the original proposal and attributes each change. It cannot rewrite items, allocate unknown flavors, switch fulfillment, approve an order or send a reply. Other incomplete proposals remain blocked. None of these features trains the model or establishes production memory.

Before that operator workflow was added, [six reasoning comparison runs](fixtures/reasoning-comparison/README.md) tested two fresh low/high pairs and two known failures. Both fresh pairs tied on critical outcomes, and only one known failure passed. The frozen promotion gate failed. The model adapter remains unchanged. All six outcomes and their original failures are retained separately from the earlier seventeen cases. The interface's human completion of one failed result does not change its model evaluation.

## Source and demonstration

For an explicitly authorized new model review, the selected programmatic entry point is:

```javascript
import { reviewSelectedFrontDesk } from './src/front-desk-selected-profile.mjs';

// Your runner supplies the synthetic packet, fresh store, authorized key,
// and persistent budget/usage callbacks. This is not a browser action.
const review = await reviewSelectedFrontDesk(packet, {
  apiKey: authorizedKey,
  lookupFacts: store.lookupFacts,
  checkQuantities: store.checkQuantities,
  beforeRequest: reserveAgainstApprovedPersistentBudget,
  onTurn: recordUsageAndRetainOutcome,
});
```

The wrapper fixes the tested Spark max/12,000/three-request profile and rejects conflicting settings. It requires the caller's key and budget gate. The default browser server does not import or call it. See [model usage](docs/MODEL-USAGE.md) for limits and the distinction from the historical reproduction example.

[Watch the demonstration](https://mykemueller1-ctrl.github.io/action-shift-meta-hackathon/), or open `docs/index.html` from this release. The final video is under three minutes and uses recorded browser interaction with larger visual captions and persistent replay/simulation labels. It is silent. No voice is attributed to Myke. It follows the operator from the original source through a completed draft, current approval and changed kitchen version, then a separate dated correction and consent example.

The earlier Evidence Inbox release is retained separately and is not included here.

## Build and scope

The v1 implementation and subsequent v2/v3/v4 revisions were written November 4, 2026, during the event, with AI coding assistance. Myke’s restaurant experience, the Action Shift name and Never86’d product concepts predate the event. Retained Mini Brain/operator documents informed the plain language, source preservation and explicit review pattern. No earlier product implementation or private restaurant corpus is included. See [provenance](docs/PROVENANCE.md) and [architecture](docs/ARCHITECTURE.md).

The demo listens on loopback only. It has no production authentication, tenant access controls, live social channel, telephony, ordering, reservation or payment integration. Real customer records and credentials are excluded. No contest submission, eligibility decision or customer outcome is implied.

License: [MIT](LICENSE).
