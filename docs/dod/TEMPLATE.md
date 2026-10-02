# DoD: [Deliverable name]

A deliverable is only "Done" when **ALL** items below are checked.

## Functional

- [ ] Actually runs (not just compiles), with real output/log as evidence
- [ ] Handles the happy path correctly
- [ ] Handles at least one edge case / abnormal input
- [ ] No hallucinated API/package (verify every import actually exists)

## Reliability

- [ ] Re-run at least 2–3 times to confirm the result isn't lucky/random
- [ ] Handles API failure gracefully (rate limit, timeout, malformed response)
- [ ] Any "detect a problem" logic (guards/detectors) has been verified to
      actually block the bad behavior, not just log a warning

## Documentation

- [ ] Significant design decisions have a corresponding DDR
- [ ] Code has comments where genuinely needed (not padding obvious lines)

## Observability

- [ ] Tracing/callbacks present on real LLM calls, per project convention
- [ ] Enough logging to debug this later without re-reading all the code

## Review

- [ ] Output has been checked against real ground truth, not just "looks fine"
- [ ] Rate-limit/concurrency risk considered for any batch/parallel calls
