# V4 final independent semantic comparison

Reviewed 2026-11-04T17:57:10.267Z by Independent Codex agent. All 18 scheduled runs have been reviewed against the unchanged frozen oracle. No model calls, application edits, output repairs or publication were performed by this reviewer.

## Decision

Promote **B: the clarified contract with Spark 1.3 at max effort**, within this bounded experiment. B passed all six cases, including both complete positive cases and all four uncertainty/conflict/consent controls. It improves critically over A on cases 01, 02, 06 with zero regressions. C does not qualify and is not recommended as a model upgrade. This permits an owner-reviewed V4 candidate; it does not alter or rescore preserved V3, establish a general reliability rate, or prove contest performance.

| Frozen case | A original Spark max | B clarified Spark max | C clarified Wonder max |
| --- | --- | --- | --- |
| 01: complete derived revision | Fail: known site and derived headline omitted | Pass | Fail: employer substituted for pickup site |
| 02: current count conflict | Fail: employer substituted for pickup site | Pass | Fail: incompatible intent/proposal; known site omitted |
| 03: unknown allocation/time | Pass | Pass | Fail: known site omitted |
| 04: ambiguous pickup site | Pass | Pass | Pass |
| 05: delivery without pickup consent | Pass | Pass | Fail: unrelated tofu/chicken/allergen/$160 answer |
| 06: family pickup with distractions | Fail: known pickup site omitted | Pass | Fail: unrelated Probe/allergy-field answer |
| **Critical passes** | **3/6** | **6/6** | **1/6** |

B retained the exact changed quantities and service-window allocation, preserved the genuine ten-versus-nine conflict, left unknown flavor/time/site choices unresolved, and retained delivery pending the guest's consent. Its adopted drafts stayed unapproved, blocked requests rejected quote preparation, and complete positives produced the expected 18100/13200-cent synthetic quotes without approval or execution receipts.

## Failure evidence and safeguards

A correct quantity tool result verifies only the quantities submitted to it. It does not prove a correct pickup destination or a relevant answer. Run 03 C structurally adopted an employer as the pickup destination and produced a valid arithmetic quote; run 06 A adopted a wrong destination while the count mismatch independently blocked its quote. These are retained semantic failures.

Run 05 C completed three provider responses but failed the output contract and was not retried. Its evidence hash targets the original failureFile, not a made-up validated packet. Runs 13/18 C had correct tools followed by unrelated final answers. Their raw provider diagnostics deep-equal the saved packet results; run/execution IDs, request numbers, receipt IDs and tool arguments match. Their four-field inputs equal the frozen cases and recorded serialized hashes; the frozen adapter hash remained unchanged. Source inspection found fresh per-call input and no shared conversation/previous_response_id. No local fixture mixup was found. Full outbound bodies and opaque reasoning were intentionally not logged, so no exact post-hoc full wire-body hash or provider-internal explanation is claimed.

All 17 validated packets match their frozen model inputs and have unchanged inference-store snapshots. Raw proposals were independently examined without repair. Test-only adoption and uncertainty-isolation probes are separate synthetic local checks, not customer actions or source-authenticated production writes. Every original failure remains in the receipts and individual reviews.

## Cost and latency

| Arm | Requests | Estimated API cost, six cases | Median summed provider time per case |
| --- | ---: | ---: | ---: |
| A | 18 | $0.179244 | 35.387s |
| B | 18 | $0.164123 | 32.611s |
| C | 18 | $0.600112 | 24.497s |

All 54 saved request diagnostics were counted, including failed-output run 05. Independent reconstruction gives **$0.943479** for this phase and **$1.476777** cumulatively accounted/reserved, including the earlier **$0.10 unknown-outcome reserve**. This matches the owner's total and remains within the $3 phase/$20 daily limits. These are usage-based estimates using the experiment's pinned prices, with cached input conservatively charged at the full rate; they are not a retrieved billing invoice. Provider time excludes owner idle time and harness I/O. Wonder was faster in this small sample but materially less successful and more costly.

A is a fresh original-contract **max** comparator, not the former low-effort deployment. A versus B isolates the clarified contract bundle. B versus C compares models at the same declared limits; identical effort labels do not establish equal internal computation. One run per arm on six authored cases chosen after prior weaknesses is not an external blinded benchmark or statistical reliability estimate. There was no quality tie and no demonstrated Wonder advantage.

## Review artifacts

- final-semantic-review.json: **dc65a8d2f534d0f1d23d5a18e71995bedc0f3b854c1451e6c74f89004b40616b**. Exact 18 rows; evidenceSha256 targets each raw validated packet or run 05 failure file.
- final-promotion-decision.json: **67e843d3f3db7ee35c14da9e3ccfbe060534a37128190c6b662ea0602fe79f89**.
- final-cost-latency-evidence.json: **cfbc4c2b53ac8836b6f949d831638d30974a58d7791d132324eb8a6bc1b2b331**. Contains per-request source hashes, usage and time.
- v4-run-01.semantic-review.json through v4-run-18.semantic-review.json: individual verdicts with supporting file hashes and findings.
- initial-semantic-review.json remains unchanged at e134d685f4dbbda4970f4d93b0e8d541f99853cab7dcf42e4f0d294d252dbef5.

No additional paid run is needed to apply this frozen decision. Final packaging/source verification remains with the existing build owner.
