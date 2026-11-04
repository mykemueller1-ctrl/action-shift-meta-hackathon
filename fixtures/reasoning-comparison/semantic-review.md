# Reasoning comparison — independent semantic review

**Decision: keep the verified v2 release unchanged. The frozen material improvement gate failed.**

Reviewer: Independent Codex agent. All six planned runs completed once. No retry, halt or missing pair. Founder acceptance remains unverified.

| Run | Input / effort | Mechanical checks | Semantic verdict | Actual adoption | Wall time | Calculated usage |
|---|---|---:|---|---|---:|---:|
| run-01 | fresh-01 / low | 15/16 | fail | Rejected: FRONT_DESK_INPUT | 15.233 s | $0.018577 |
| run-02 | fresh-02 / high | 18/18 | pass | Rejected: FRONT_DESK_INPUT | 40.999 s | $0.030934 |
| run-03 | fresh-01 / high | 15/16 | fail | Rejected: FRONT_DESK_INPUT | 25.496 s | $0.021579 |
| run-04 | fresh-02 / low | 18/18 | pass | Rejected: FRONT_DESK_INPUT | 21.425 s | $0.020301 |
| run-05 | regression-core-01 / high | 13/15 | fail | Rejected: FRONT_DESK_INPUT | 25.714 s | $0.026432 |
| run-06 | regression-supplement-04 / high | 16/16 | pass | Unapproved draft | 21.566 s | $0.021487 |

The aggregate 95/99 is a count of heterogeneous mechanical checks, not model accuracy. Semantic outcomes are three passes and three failures.

## Paired result

- **fresh-01: tie-fail.** Both return the correct derived twelve and exact allocations but destination:null. Both actual adoption attempts reject for that omission. High only retains the location in prose.
- **fresh-02: tie-pass.** Both preserve the known location/date/counts/times, leave unknown flavors empty, ask useful questions and are correctly rejected for incomplete allocations.

No fresh pair showed a critical improvement from high effort. The known supplemental failure passed on its high rerun, but the known core failure remained. Historical regression runs also changed the output cap from 5000 to 12000, so that one improvement cannot be attributed solely to reasoning effort.

## Exact promotion gate

| Frozen condition | Met | Evidence |
|---|---|---|
| allRunsCompleteRequired | Yes | All six planned single attempts completed; no halt or missing arm. |
| allFreshPairsCompleteRequired | Yes | Both low/high pairs completed using identical model-visible input within each pair. |
| bothFreshHighMustPassEveryCriticalCriterion | No | run-03 fails explicit pickup-location preservation and complete-draft adoption. |
| freshHighMustPreserveAllKnownFields | No | run-03 destination is null despite explicit Maple Street Kitchen. |
| freshHighMustPreserveUnknownsAndAskUsefulClarification | Yes | run-02 keeps unknown window flavors empty in tools/output and asks exact allocation questions. |
| freshIncompleteActualAdoptionMustBeBlocked | Yes | run-02 actual rejection is specifically due to empty allocations, with no missing known fields. |
| freshCompleteHighActualAdoptionMustRemainUnapprovedDraft | No | run-03 cannot adopt because destination is missing. |
| noHighRegressionRelativeToLowOnFreshCriticalChecks | Yes | No fresh critical regression observed; both pairs tie on critical outcomes. |
| atLeastOneFreshHighCriticalImprovementOverLowRequired | No | No critical field or adoption improvement in either fresh pair. |
| bothKnownHighRegressionsMustMeetFrozenAndApplicationTargets | No | run-06 passes, but run-05 keeps null headline/unnecessary confirmation and has the wrong pickup destination. |

## Per-run criteria

### run-01 — fail

Packet: `reasoning-run-01-2026-11-04T16-21-23-777Z-13c77ca7-f3a9-45e3-8db1-2cd6834d32c2-validated-review.json`.

- Low derives the correct final twelve and exact windows, but omits the supplied pickup location.
- The actual complete-request proposal cannot be adopted; this is a structured completeness failure, not failed arithmetic.

| Frozen criterion | Result | Evidence |
|---|---|---|
| 1 | fail | Explicit Maple Street Kitchen is absent from structured destination, which is null. Other explicit date/time/service fields are retained. |
| 2 | pass | Final item totals are cheese 5, pepper 4, garden 3, with exact 5/7 allocations and revised 18:20 time. |
| 3 | pass | Final headline is 12 and no unnecessary arithmetic question is asked. The literal historical 11 is not reused as the final total. |
| 4 | pass | Quantity tool receives permitted derived headline 12, computes 12 and confirms matching allocations. |
| 5 | pass | November 8 facts and actual menu IDs are used. The result is an unapproved draft; no external action or menu price is claimed. |
| 6 | fail | Actual proposal is rejected by the existing adoption action for missing destination. The separate probe leaves all case state unchanged. |

Independent adoption: rejected with FRONT_DESK_INPUT; A reviewed proposal needs bounded food, date, service, destination and window fields. State unchanged.

### run-02 — pass

Packet: `reasoning-run-02-2026-11-04T16-22-00-796Z-d607b958-d48b-4f31-aac3-1527c34367e2-validated-review.json`.

- High preserves all known fields while asking for genuinely unknown flavor allocations.
- The actual validator rejects specifically because allocations are empty. No known field is missing.

| Frozen criterion | Result | Evidence |
|---|---|---|
| 1 | pass | Partial proposal retains date, pickup mode, Maple Street Kitchen, headline 5, exact overall flavors and both times. |
| 2 | pass | Questions ask the flavor breakdown for the known 3-pizza and 2-pizza windows without asking for supplied details. |
| 3 | pass | Both final window item arrays are empty; quantity-tool windows are empty. No guessed allocation is used and status is needs-clarification. |
| 4 | pass | November 7 facts are retrieved. The reply remains a draft without invented consent, courier cause, approval or completed action. |
| 5 | pass | Actual adoption rejects for empty window allocations, with all known fields present and state unchanged. This is the intended guard, not a rejection caused by another omission. |

Independent adoption: rejected with FRONT_DESK_INPUT; Each service window needs a unique ID and item allocations. State unchanged.

### run-03 — fail

Packet: `reasoning-run-03-2026-11-04T16-22-48-158Z-c310ac82-3feb-4830-ba74-cb2bf175b2e7-validated-review.json`.

- High repeats the same destination=null omission as low on the identical complete-request input.
- The location appears in the high reply but not the structured proposal. That prose difference does not enable adoption or satisfy the frozen field-preservation gate.

| Frozen criterion | Result | Evidence |
|---|---|---|
| 1 | fail | Explicit Maple Street Kitchen is absent from structured destination, which is null. Other explicit date/time/service fields are retained. |
| 2 | pass | Final item totals are cheese 5, pepper 4, garden 3, with exact 5/7 allocations and revised 18:20 time. |
| 3 | pass | Final headline is 12 and no unnecessary arithmetic question is asked. The literal historical 11 is not reused as the final total. |
| 4 | pass | Quantity tool receives permitted derived headline 12, computes 12 and confirms matching allocations. |
| 5 | pass | November 8 facts and actual menu IDs are used. The result is an unapproved draft; no external action or menu price is claimed. |
| 6 | fail | Actual proposal is rejected by the existing adoption action for missing destination. The separate probe leaves all case state unchanged. |

Independent adoption: rejected with FRONT_DESK_INPUT; A reviewed proposal needs bounded food, date, service, destination and window fields. State unchanged.

### run-04 — pass

Packet: `reasoning-run-04-2026-11-04T16-23-24-817Z-07ea8f56-8fcc-47d1-93e4-a19aa418bded-validated-review.json`.

- Low also preserves all known fields and unknown allocations, asks useful questions, and remains correctly blocked.
- The high arm has no additional critical success on this fresh pair.

| Frozen criterion | Result | Evidence |
|---|---|---|
| 1 | pass | Partial proposal retains date, pickup mode, Maple Street Kitchen, headline 5, exact overall flavors and both times. |
| 2 | pass | Questions ask the flavor breakdown for the known 3-pizza and 2-pizza windows without asking for supplied details. |
| 3 | pass | Both final window item arrays are empty; quantity-tool windows are empty. No guessed allocation is used and status is needs-clarification. |
| 4 | pass | November 7 facts are retrieved. The reply remains a draft without invented consent, courier cause, approval or completed action. |
| 5 | pass | Actual adoption rejects for empty window allocations, with all known fields present and state unchanged. This is the intended guard, not a rejection caused by another omission. |

Independent adoption: rejected with FRONT_DESK_INPUT; Each service window needs a unique ID and item allocations. State unchanged.

### run-05 — fail

Packet: `reasoning-run-05-2026-11-04T16-23-57-260Z-34cd05d4-fef5-4065-81d4-f9c92a67fa52-validated-review.json`.

- The original two mechanical misses remain: null headline in the quantity call and final proposal. They are not arithmetic errors.
- Additional application target fails: the requester is placed in the pickup destination field. This is a role mismatch, not a corrected pickup location.
- Actual adoption rejects for missing headline. The stated-total/null tool contract and derived-final application expectation remain in tension; this is not clean evidence of general model inability.
- This is a known regression and also changes the historical output cap from 5000 to 12000.

| Frozen criterion | Result | Evidence |
|---|---|---|
| 1 | fail | The model derives eleven in prose and item sums, but keeps headlineQuantity null and asks to reconfirm the revised total. |
| 2 | pass | November 5 12:15 and 18:45 windows retain exact 3/8 allocations. |
| 3 | fail | Structured destination is Fictional Print Room K, the requesting crew, instead of the named Maple Street Kitchen collection point. The intended pickup location is not retained in the result. |
| 4 | pass | Requested November 5 facts are retrieved; no price is asserted. |
| 5 | pass | The result remains a draft and does not invent approval, payment, kitchen action or fulfillment. |

Independent adoption: rejected with FRONT_DESK_INPUT; A reviewed proposal needs bounded food, date, service, destination and window fields. State unchanged.

### run-06 — pass

Packet: `reasoning-run-06-2026-11-04T16-24-30-173Z-b1da2841-9091-427e-a98b-d4aab8d6d802-validated-review.json`.

- High corrects the known supplemental location omission on this attempt and passes all frozen criteria.
- The actual existing action adopts it as a new unapproved draft, with no quote, approval or kitchen receipt.
- This known-case success does not establish an effort-only improvement: the historical run had a 5000 output cap, while this run uses 12000.

| Frozen criterion | Result | Evidence |
|---|---|---|
| 1 | pass | Explicit final nine replaces the earlier seven; exact overall item totals are retained. |
| 2 | pass | November 6, both exact windows/allocations and Maple Street Kitchen in structured destination are retained. |
| 3 | pass | questions is empty; no unnecessary missing-total or missing-location question. |
| 4 | pass | The result remains an unapproved draft with no invented booking, payment, fulfillment or kitchen action. |

Independent adoption: accepted as an unapproved draft with no quote, approval or receipts.

## Integrity and limits

Each actual four-field model input matches its frozen case. Each saved final result matches its final raw diagnostic. Every actual adoption outcome was independently reproduced without inference in a separate fresh store. Fresh cases SHA256: `4df54d7426186d6f3d593746cb16f537d849288a01f458cdd81b05bb6f5ac0df`. Acceptance protocol SHA256: `22c90c6a5bc02cf7366857be5959656f89fcabb5b4c489d06a3c50ab2b9c9e47`.

- The original quantity tool describes a customer-stated total, with null when unknown. Historical core case-01 expects a derived revised final total. Keep its original failure unchanged, but report this contract tension. The fresh derived case explicitly labels literal historical 11 versus derived final 12.
- Historical regression runs used a 5000 output token cap. Their new high runs use 12000, so a change cannot be attributed only to reasoning effort. Only the fresh low/high pairs share the same output cap and isolate effort.
- The author has seen earlier outcomes and intentionally targets known weaknesses. Two fresh inputs and two known regressions do not form a reliability benchmark.
- Changing a prompt, schema, default destination or inferred allocation to force success is outside this experiment.
- The high known-core result misassigns the requesting crew to the pickup destination field. This is a separate application mismatch and was not an added historical mechanical check.
- The observed high arms cost more and took longer in these two fresh pairs without changing their critical outcomes. Two single attempts per effort are not a latency, cost or reliability benchmark.
- All actual adoption checks were repeated independently on fresh local memory stores after verifying the read-only model assessment. Accepted probe state is an unapproved local draft, not restaurant execution.
- The frozen preparation protocol retains inferencePermitted:false. Actual execution was governed by the separate approved executionapproval.json, whose hash is recorded.
- No inference call or existing source/public/form change was made by this semantic reviewer.

Phase usage: **$0.139310** from reported tokens. Cumulative accounting and reserves: **$0.533298**, including the unchanged **$0.10 uncertain historical reserve**. No new unknown outcome. These are calculated usage records, not an invoice. No further inference is required for this conclusion.
