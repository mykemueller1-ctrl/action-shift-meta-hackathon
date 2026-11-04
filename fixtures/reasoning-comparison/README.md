# Reasoning comparison

Six runs were completed once before this interface revision. Both fresh inputs were tested at low and high reasoning, with the same 12,000 token output cap. Two previously failed inputs were also tested at high reasoning. Those historical comparisons also changed the earlier 5,000 token cap and cannot isolate reasoning effort.

| Run | Input | Effort | Mechanical checks | Final semantic outcome |
|---|---|---|---:|---|
| [01](run-01.json) | Fresh complete revision | Low | 15/16 | Fail. The named pickup location is missing from the proposal. |
| [02](run-02.json) | Fresh incomplete allocation | High | 18/18 | Pass. Known fields stay intact. Unknown flavor allocations remain blocked. |
| [03](run-03.json) | Fresh complete revision | High | 15/16 | Fail. The same pickup location omission remains. |
| [04](run-04.json) | Fresh incomplete allocation | Low | 18/18 | Pass. Same critical result as high. |
| [05](run-05.json) | Known core failure | High | 13/15 | Fail. Null headline, unnecessary confirmation and incorrect pickup destination. |
| [06](run-06.json) | Known supplemental failure | High | 16/16 | Pass. Actual adoption succeeds as an unapproved local draft. |

The frozen promotion gate failed. No higher reasoning setting was promoted. The original quantity tool has a stated versus derived total tension, which remains disclosed in the [independent review](semantic-review.md). These results are targeted synthetic examples, not an accuracy or production reliability benchmark.

Every packet here is byte identical to the recorded output. [The manifest](manifest.json) maps the shorter filenames to the original evidence names and hashes. Mechanical assessments, actual local adoption probes, frozen fresh inputs and acceptance criteria are included. Raw packets retain their original pending review labels. The separate final semantic review supplies the verdict.

Run 01 is now also available as an explicitly failed recorded review in the application. Its missing pickup location can be completed by a person from the displayed source. The original result and failure remain visible. That is a new operator workflow, not a corrected model result or a new model call.

The 18 requests used 62,476 input and 14,402 output tokens, including 9,557 reasoning tokens within output. Calculated usage was $0.139310. It is not an invoice. No private restaurant records were used.
