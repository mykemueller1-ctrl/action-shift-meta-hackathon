# V4 contract and model comparison: complete evidence

This directory preserves all 18 scheduled outcomes across six synthetic restaurant cases and three arms. It is evidence, not a live inference service. No result was repaired or replaced with a retry. The separate application replay selection does not remove failed or unselected outcomes from this bundle.

- **A:** original contract, Muse Spark 1.3, max effort, 12,000 output-token cap. This is not the older deployed low-effort configuration.
- **B:** clarified contract, Muse Spark 1.3, max effort, the same cap.
- **C:** the same clarified contract, Muse Wonder 1.0, max effort, the same cap. Equal effort labels do not establish equal internal compute across models.

The independent final review records critical passes **A 3/6, B 6/6, C 1/6**. B improves the frozen critical outcomes on cases 01, 02 and 06 without a critical regression in the other three cases. This supports the owner's bounded B selection for this prototype. Six authored synthetic cases, one attempt per arm, are not a general reliability estimate or a model leaderboard. Read the individual findings and qualifications, not only the counts.

Read the [final independent findings](final-semantic-findings.md), [bounded promotion decision](final-promotion-decision.json), and [cost and latency reconstruction](final-cost-latency-evidence.json). All three are preserved byte-for-byte from the independent reviewer.

## Contents and provenance

`evidence-manifest.json` pins every included file's size and SHA256. `meta-v4-evaluation/` contains the exact frozen model inputs, the expected-answer oracle, acceptance and technical protocols, execution/stage approvals, accounting snapshots, initial-stage review, offline transport preflight, pure assessment/accounting helpers, raw outcomes and sanitized diagnostics. `meta-v4-contract/` retains both adapters and their pre-run freeze lineage. `action-shift-v3/src/` preserves the frozen local validator and correction-storage sources used for state and adoption probes. `semantic-reviews/` contains all 18 detailed independent reviews; `final-semantic-review.json` binds the aggregate decisions to their raw evidence hashes.

The oracle's historical `.private` filename and local-review visibility note mean it was withheld from the model during inference. Its synthetic expectations are published after execution for auditability. None of its answers, labels or criteria were sent in the four-field model input. Original frozen protocols are byte-identical; four original generic local provenance paths remain in the acceptance protocol so its original hash can be verified. Those strings are not links to additional private files or an instruction to load them.

There are **17 validated packets**, each with its mechanical assessment and a separate fresh local adoption probe. Full before/after read-only state is inside each validated packet; full adoption state and any isolation probes are inside its adoption file. The mechanical assessment can be more permissive than the independent semantic verdict.

**Run 05 failed output validation.** Its failure record and all three request diagnostics are retained, including the returned final text. No validated packet, mechanical assessment or adoption/full-state probe was produced after that failure; none has been invented here. The detailed independent review explains the failure. All **54 new request diagnostics** are included, with no retry.

## Limits of the recorded diagnostics

Diagnostics retain visible assistant output, tool calls, response identity, model metadata, reported token usage and timing after sanitization. They exclude credentials, request headers and opaque reasoning payloads. They are not a full outbound wire capture or a view of provider-internal reasoning. A comment or inconsistency in returned text cannot establish its internal cause. The offline preflight records mocked request-body inspection, not provider receipt of an exact wire payload.

The final ledger retains its historical `preparation-only` field, and packets retain `pending-independent-review` labels from creation. These original fields are not rewritten; separate execution approvals and final semantic reviews establish the later actions and decisions. Baseline accounting includes a previously retained $0.10 uncertainty reserve exactly once. New reported usage and charges are retained in the V4 ledger; an accounted amount is an estimate from reported tokens and published pricing, not a billing statement.

No credential launcher, environment file, key, DPAPI file, private customer record or unrelated workspace document is included. The source modules are audit artifacts; this package does not supply credentials or execute them. Restaurant actions in probes are synthetic local state transitions, with no customer message, payment, actual kitchen dispatch or external booking performed.
