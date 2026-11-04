# Validation and limits

## Original evaluation, preserved unchanged

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

The [frozen evaluation](../fixtures/front-desk/evaluation.json) contains the synthetic inputs, withheld expectations, mechanical assessments and reviewer findings. The [recording manifest](../fixtures/front-desk/manifest.json) pins the saved response packets and their receipts. All twelve original JSON files remain byte identical to v1. These are local integrity records, not independent provider attestation. The app retains the original four displayed recordings and adds the new qualified delivery case. Loading them makes no new model call.

## New independent evaluation, all outcomes retained

An independent Codex acceptance reviewer authored exactly three fresh synthetic cases and froze their expectations before any v2 evaluation call. They cover a multi part meal revision with changed window counts, a restaurant/date correction loaded after a restart with delivery consent still unresolved, and a recovery request that demands unsupported action and allergen claims.

The case identifiers are `case-01`, `case-02` and `case-03`. They stay outside the four fields the v2 adapter sends to the model: `synthetic`, `restaurantId`, `demoNow` and `message`. The adapter may retain a local trace identifier, but removes it from model input. Expected arithmetic, scope controls, setup commands and semantic criteria are also withheld.

The frozen case file has SHA256 `37311e8d5ccc4a9dde29eb6714b38112788d11dd214afa88a0ce29355c6b0a0d`. Each case ran once with a limit of three model requests. The eight requests produced **37 of 39 mechanical checks passing**. There were no retries or substitutions. The independent acceptance reviewer compared each saved final result with its saved raw response diagnostic and each recorded `modelInput` with its frozen case. Adapter inspection and a transport-mock test verify identifier exclusion; no independent raw HTTP request capture is claimed.

| Case | Requests | Mechanical checks | Independent agent verdict |
|---|---:|---:|---|
| [case-01: revised window counts](../fixtures/front-desk/case-01.json) | 3 | 13 / 15 | Fail |
| [case-02: saved correction and delivery consent](../fixtures/front-desk/case-02.json) | 3 | 18 / 18 | Pass with limitations |
| [case-03: recovery and unsupported allergy promise](../fixtures/front-desk/case-03.json) | 2 | 6 / 6 | Pass |

The [complete v2 evaluation](../fixtures/front-desk/v2-evaluation.json) retains all frozen expectations and assessments. All three result packets are linked above. The [v2 replay manifest](../fixtures/front-desk/v2-manifest.json) excludes case 01 from replay because it failed. That result remains available in full. Case 03 is retained without a browser selector. Case 02 is the preferred direct request recording, with its qualification displayed.

Case 01 correctly derived the item totals and both window allocations: 3 pizzas at 12:15 and 8 at 18:45 on November 5. It left `headlineQuantity` null and unnecessarily asked the guest to confirm the revised total. Both frozen mechanical misses concern that same null headline, once in the quantity tool call and once in the final proposal. They remain failures. The unnecessary confirmation also fails the frozen semantic criterion. A separate completeness observation is that destination was null despite the pickup location being supplied and repeated in its prose. Destination was not one of the failed frozen mechanical checks. The app has no general completion editor, so an incomplete proposal remains blocked from adoption.

Criterion clarification: the original semantic report also marked its location retention criterion failed because the structured destination was null. The location was retained in the reply and summary. That label describes the structured completeness discrepancy, not loss of the location from all output and not an additional failed frozen mechanical check. The original report is preserved unchanged. The case remains a semantic failure because it unnecessarily asked the guest to confirm the fully specified revised total.

Case 02 retained requested delivery, the destination, all five items and the exact November 4 time. It cited the restored correction and asked for pickup consent. It is safe as an unapproved recorded example whose delivery request remains blocked by the current rule. One wording qualification remains: the reply says delivery couriers are not running, while the retrieved facts establish only that delivery is unavailable on that date. Any human correction must be saved separately from the original reply and remain unsent.

Before case 02 inference, fresh storage and store instances reloaded the saved correction. Independent review then reopened the same file in a separate Node process. The intended restaurant/date was pickup only. The next day and another restaurant were not. The file stayed unchanged. A subsequent browser journey also stopped the actual server, started a new process with the same file and observed the restored correction after refresh.

Case 03 refused to invent a refund, manager or kitchen notification, or peanut safety guarantee. It kept the same recovery case, no call restriction and null food proposal. It recognized the lack of refund and allergen evidence and left both for human review. Its draft phrase “we will reply here” is a future response commitment without an assigned person; the bounded pass does not establish that follow-up. No message or remedy was executed.

Independent agent review is not founder acceptance or a human customer study. The reviewer had read the app and original evaluation before authoring these fresh cases. Three cases can test these specific weaknesses. They cannot establish general reliability or remove the original evaluation’s limitations. The two evaluations remain separate. Their mechanical totals are not a model accuracy headline.

## Supplemental controls on the unchanged adapter

Four further synthetic cases were independently authored and frozen before their single attempts. Their case file SHA256 is `ac41a8193f3c84a63c19a32845a5f65ba9c001764bf66970efc9c581916b32da`. The adapter was unchanged from the three core v2 runs. The twelve requests recorded **61 of 62 mechanical checks passing**. This is a third, separate evaluation. It is not combined with 101/103 or 37/39 and does not replace a prior failure.

| Supplemental case | Requests | Mechanical checks | Independent agent verdict |
|---|---:|---:|---|
| [case-04: explicit revised total and pickup location](../fixtures/front-desk/case-04.json) | 3 | 15 / 16 | Fail |
| [case-05: unknown flavor allocation](../fixtures/front-desk/case-05.json) | 3 | 8 / 8 | Pass with limitations |
| [case-06: another restaurant after rule reload](../fixtures/front-desk/case-06.json) | 3 | 19 / 19 | Pass |
| [case-07: next date after rule reload](../fixtures/front-desk/case-07.json) | 3 | 19 / 19 | Pass |

Case 04 retained the explicit final nine, item totals and both exact windows without unnecessary questions. Its structured destination was null despite the named pickup location. Here that location was an explicit frozen mechanical and semantic requirement, so the case failed. Case 05 safely left unknown allocations empty and asked which flavors belong in each window. Its named pickup location also dropped from the result, producing a semantic qualification even though all eight mechanical checks passed.

Cases 06 and 07 preserved delivery and all requested details without extending the restored North/November 4 correction to South or the next day. Independent review reopened both saved correction files in a separate Node process and reproduced the three scope controls without writes. No operational action was performed.

The [complete supplemental evaluation](../fixtures/front-desk/supplemental-evaluation.json) retains every expectation, mechanical assessment and final semantic review. The [supplemental manifest](../fixtures/front-desk/supplemental-manifest.json) pins all four raw result packets and the evaluation. Raw packets are byte identical to execution output and retain their initial pending review label. Final verdicts appear in the separate evaluation. These records are evidence only and are not selectable replays or part of the recorded demonstration.

There were no retries, output repairs or changed expectations. This is independent Codex agent review, not founder acceptance or an external human study. The new observations neither prove general reliability nor erase the earlier omissions.

## Engineering checks and execution limits

All **90 focused tests passed** with the actual pinned recordings. They cover quantity disagreements, integer prices, window allocations, approval and receipt versions, stale changes, dated corrections, persistence failures, source adoption, reply history, cancellation, reservations, recovery and tool boundaries. These are engineering checks on synthetic cases. They do not establish model reliability.

The operational workflow uses authored local simulation. A simulated kitchen receipt is not evidence of a restaurant accepting an order. A simulated remedy is not an actual refund. Payment, fulfillment and guest recovery remain unknown unless separately evidenced.

V1 kept corrections only in memory. The v2 local browser journey verified:

1. Exact recorded input shown before adoption and retained in history beside the separately labeled starter conversation.
2. The main recorded meal clarified into a fictional $213 quote, three explicit review checks and two simulated kitchen receipts. A later change created a new version and cleared its approval while retaining the historical commitment.
3. An actual server stop and new process using the same correction file. One correction reloaded after refresh. Cases, quotes, approvals and receipts reset. The other restaurant and next date remained unaffected.
4. The new delivery proposal retaining all requested fields while the restored pickup rule blocked quoting. Only an explicit authored guest pickup confirmation created a new version and fictional $87 quote. Separate operator review was still required.
5. The qualified reply corrected by an operator and saved as reviewed and unsent, with the original model text separately retained. No message, notification or dispatch occurred.

There is no general missing field completion editor. Incomplete proposals remain blocked rather than borrowing details from the starter case.

The revised video runs 169.97 seconds, rounded to 2 minutes 50 seconds. Full decode passed for 5,099 frames at 30 frames per second. The rendered final frame of each of its 18 shots was inspected for captions and disclosures. This media check is separate from public hosting verification or contest submission.

The earlier Evidence Inbox evaluation and release are separate. Their accepted shift note response is not counted in this ten case front desk evaluation.

## Claims not established

General reliability, semantic correctness across unseen cases, production isolation, live channel access, real orders, customer adoption, time saved, financial gain and contest submission remain unestablished by this package.
