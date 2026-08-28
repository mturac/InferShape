# InferShape Coding-Agent Session Intelligence Design

## Product outcome

A vibe coder provides a local coding-agent session trace and receives a deterministic explanation of why the session stalled or overclaimed, plus a privacy-safe repair packet that lets another agent resume from verified evidence.

## Boundaries

InferShape analyzes delivery-session shape. It is not a generic inference profiler, model router, hosted observability platform, code reviewer, or product acceptance authority.

## Inputs

V0.1 accepts JSON, JSONL, generic normalized events, and common OpenTelemetry/OpenInference-shaped span records. The normalizer recognizes timestamps, tool operations, paths, commands, outcomes, durations, test scope, objective fingerprints, scope paths, and completion claims.

Content-bearing fields are discarded before analysis. Command text is opt-in. Session, objective, and command identifiers are domain-separated SHA-256 pseudonyms.

## Analysis

The deterministic engine computes:

- time to first edit, first passing test, and verified completion;
- repeated repository reads;
- repeated writes and content-hash reversals;
- consecutive identical tool loops;
- unresolved failures by stable signature;
- focused versus full-suite test use;
- changed paths outside declared scope;
- false completion after comparing the final write with later verification;
- avoidable exploration ratio;
- command and test latency percentiles.

## Outputs

- versioned JSON session report;
- Markdown report;
- self-contained escaped HTML report;
- versioned repair packet;
- deterministic report and packet hashes;
- baseline/candidate comparison with CI exit code 2 on regression.

## Verification

A session is verified only when a successful completion signal exists, no failure remains unresolved, and successful verification occurs after the final write/delete event.

The release gate includes strict TypeScript, public type contracts, privacy tests, CLI tests, schema integrity, PNG asset validation, and real npm package consumer smoke tests on Node.js 22 and 24.
