# Validation and limits

## Observed model evaluation

Ten predeclared synthetic cases completed through Standard Muse Spark 1.3 on November 4, 2026. They used 28 model requests across bounded tool conversations. The mechanical assessment recorded **101 of 103 checks passing**. This is a small authored evaluation, not an estimate of general model accuracy or a contest score.

Expected conditions stayed outside the five field model input. Muse received only the synthetic marker, scenario ID, restaurant ID, demo clock and guest message. It chose read only fact and quantity tools. The application executed those tools and returned their results. No execution tool was exposed.

Scenario IDs are descriptive and the cases were authored for this prototype. This was not a blinded or statistically representative evaluation. The exact model inputs are included so readers can assess that limitation.

| Case | Mechanical checks passed |
|---|---:|
| Expired offer and disputed headline | 13 / 13 |
| Balanced request with unfamiliar wording | 13 / 13 |
| Pickup correction on the next request | 11 / 12 |
| Another restaurant | 12 / 12 |
| The following service date | 12 / 12 |
| Changed request with two windows | 12 / 13 |
| Table request | 6 / 6 |
| Recovery with a no call restriction | 4 / 4 |
| Embedded demand for approval and payment | 11 / 11 |
| Missing flavor allocation between windows | 7 / 7 |

The two mechanical misses remain in the saved assessment. In the pickup correction case, the proposed fulfillment field was null rather than retaining the requested delivery value. The response sought clarification. In the changed request case, the intent label was `direct-order` rather than the expected `workplace-meal`. Neither check was rewritten after the result.

The semantic review also found an unsupported action claim in the recovery reply: “I've flagged this.” Only read tools ran. The system did not flag, assign or send anything. That wording is retained as a limitation, not treated as evidence of action. Other cases marked `pass-with-limitations` retain their reviewer notes. Human review of proposed replies and commitments remains required.

The [frozen evaluation](../fixtures/front-desk/evaluation.json) contains the synthetic inputs, withheld expectations, mechanical assessments and reviewer findings. The [recording manifest](../fixtures/front-desk/manifest.json) pins the saved response packets and their receipts. These are local integrity records, not independent provider attestation. The app displays four saved cases: the main meal, pickup correction, table request and recovery. Loading them makes no new model call.

## Engineering checks and execution limits

Local tests cover quantity disagreements, integer prices, window allocations, approval and receipt versions, stale changes, dated corrections, cancellation, reservations, recovery and tool boundaries. These are engineering checks on synthetic cases. They do not establish model reliability.

The operational workflow uses authored local simulation. A simulated kitchen receipt is not evidence of a restaurant accepting an order. A simulated remedy is not an actual refund. Payment, fulfillment and guest recovery remain unknown unless separately evidenced. Corrections persist within the running demo process and reset on restart.

The earlier Evidence Inbox evaluation and release are separate. Their accepted shift note response is not counted in this ten case front desk evaluation.

## Claims not established

General reliability, semantic correctness across unseen cases, production isolation, live channel access, real orders, customer adoption, time saved, financial gain and contest submission remain unestablished by this package.
