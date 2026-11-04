# Action Shift Front Desk

A missed detail becomes rework. Keep the guest’s request, the restaurant’s decision and the kitchen’s version together.

This event prototype follows a fictional conversation from a food question to a proposed meal, operator review and a simulated kitchen acknowledgment. Myke Mueller, founder of Never86’d, brings the operator’s decision process. Every restaurant, guest, menu, price and transaction in the demo is fictional.

## Run locally

Install Node 22 or later. No package installation or external service is required for the authored demo.

```powershell
node src/front-desk-demo.mjs
```

Open http://127.0.0.1:4330/front-desk. Windows users can also run `start-action-shift.cmd`. Stop the server with Ctrl+C.

Run the included tests:

```powershell
node --test test/*.test.mjs
```

The equivalent npm commands are `npm start` and `npm test`. To run authored simulation without loading saved model results, use `node src/front-desk-server.mjs` or `npm run authored`. Tests use mocked model transports and local HTTP servers. They do not establish model reliability.

## Follow one request

Start with the workplace meal. The headline and item lines disagree. Keep that disagreement visible until the customer clarification. Then prepare a quote from the fictional menu, review price, timing and capacity, and record a simulated acknowledgment for each service window.

A later guest change creates a new version. The old receipt stays visible. The new version needs its own review and acknowledgment. A dated operator correction can make this restaurant pickup only for that day. The next request reads that correction. Another restaurant and another date retain their own facts.

Table reservations and service recovery are separate examples. A table request does not become a food order. An offered remedy does not become an issued remedy. A no call request remains attached.

## What ran and what is simulated

The front desk starts in authored simulation mode. It makes no model request at startup and sends no messages, bookings, orders or payments. A separate Muse Spark 1.3 adapter can retrieve fictional facts and check quantities through local tools. Its answer is a proposal for human review.

A recorded model review is available only when a validated synthetic response and its pinned loader are included and configured. A replay is labeled as recorded. Loading it does not call the model. Adopting its proposal does not approve a quote or acknowledge a kitchen order.

The included evaluation covers ten synthetic cases and 28 model requests. It records 101 of 103 mechanical checks passing, with the misses and wording limitations retained. That result is not a general accuracy claim. See [validation](docs/VALIDATION.md) and [model reproduction](docs/MODEL-USAGE.md).

State and reviewed corrections are held in memory for the running demo. Restarting resets them. This is not persistent production memory or model training. See [validation and limits](docs/VALIDATION.md).

## Source and demonstration

[Watch the recorded demonstration](https://mykemueller1-ctrl.github.io/action-shift-meta-hackathon/), or open `docs/index.html` from this release. The video uses actual browser interactions at natural speed, with captions and persistent replay/simulation labels. It is silent; no voice is attributed to Myke.

The earlier Evidence Inbox release is retained separately and is not included here.

## Build and scope

This focused front desk implementation was written November 4, 2026, during the event, with AI coding assistance. The Action Shift name, restaurant idea and Never86’d operator logic existed earlier. No pre event product implementation is included. See [provenance](docs/PROVENANCE.md) and [architecture](docs/ARCHITECTURE.md).

The demo listens on loopback only. It has no production authentication, tenant access controls, live social channel, telephony, ordering, reservation or payment integration. Real customer records and credentials are excluded. No contest submission, eligibility decision or customer outcome is implied.

License: [MIT](LICENSE).
