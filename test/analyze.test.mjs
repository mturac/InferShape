import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEvents, analyzeRecords, normalizeRecords } from "../dist/index.js";

const problem = [
  { timestamp: 1000, type: "session_start", session_id: "s", objective: "fix bug", scope_paths: ["src", "test"] },
  { timestamp: 2000, type: "file_read", session_id: "s", path: "src/a.ts" },
  { timestamp: 3000, type: "file_read", session_id: "s", path: "src/a.ts" },
  { timestamp: 4000, type: "file_read", session_id: "s", path: "src/a.ts" },
  { timestamp: 5000, type: "file_write", session_id: "s", path: "src/a.ts", content_hash: "a" },
  { timestamp: 6000, type: "file_write", session_id: "s", path: "src/a.ts", content_hash: "b" },
  { timestamp: 7000, type: "file_write", session_id: "s", path: "src/a.ts", content_hash: "a" },
  { timestamp: 8000, type: "file_write", session_id: "s", path: "README.md", content_hash: "x" },
  { timestamp: 9000, type: "test_run", session_id: "s", command: "npm test", outcome: "failure", test_scope: "full" },
  { timestamp: 10000, type: "test_run", session_id: "s", command: "npm test", outcome: "failure", test_scope: "full" },
  { timestamp: 11000, type: "test_run", session_id: "s", command: "npm test", outcome: "failure", test_scope: "full" },
  { timestamp: 12000, type: "completion_claim", session_id: "s", claim: "done" }
];

test("analysis detects session failure shapes", () => {
  const report = analyzeRecords(problem, { now: new Date("2026-01-01T00:00:00Z") });
  const codes = new Set(report.findings.map((finding) => finding.code));
  assert.equal(report.metrics.repeatedReadCount, 2);
  assert.equal(report.metrics.patchChurnCount, 3);
  assert.equal(report.metrics.outsideScopeWriteCount, 1);
  assert.equal(report.metrics.fullSuiteRunCount, 3);
  assert.equal(report.metrics.falseCompletion, true);
  assert.equal(report.metrics.verifiedCompletion, false);
  for (const code of ["IS101_REPEATED_EXPLORATION", "IS102_PATCH_CHURN", "IS104_UNRESOLVED_FAILURE", "IS105_FULL_SUITE_THRASHING", "IS106_SCOPE_ESCAPE", "IS107_FALSE_COMPLETION"]) {
    assert.equal(codes.has(code), true, code);
  }
});

test("analysis recognizes verified completion only after final write", () => {
  const report = analyzeRecords([
    { timestamp: 1700000000000, type: "session_start", session_id: "s" },
    { timestamp: 1700000001000, type: "file_write", session_id: "s", path: "src/a.ts" },
    { timestamp: 1700000002000, type: "test_run", session_id: "s", command: "npm test -- a", outcome: "success", test_scope: "focused" },
    { timestamp: 1700000003000, type: "completion_claim", session_id: "s", claim: "done" }
  ], { now: new Date("2026-01-01T00:00:00Z") });
  assert.equal(report.metrics.verifiedCompletion, true);
  assert.equal(report.metrics.falseCompletion, false);
  assert.equal(report.metrics.timeToFirstEditMs, 1000);
  assert.equal(report.metrics.timeToFirstPassingTestMs, 2000);
  assert.equal(report.metrics.timeToVerifiedCompletionMs, 3000);
});

test("analysis is deterministic apart from generatedAt", () => {
  const events = normalizeRecords(problem);
  const first = analyzeEvents(events, { now: new Date("2026-01-01T00:00:00Z") });
  const second = analyzeEvents(events, { now: new Date("2027-01-01T00:00:00Z") });
  assert.equal(first.profileHash, second.profileHash);
  assert.notEqual(first.generatedAt, second.generatedAt);
});

test("three identical reads trigger a tool loop", () => {
  const report = analyzeRecords([
    { timestamp: 1, type: "file_read", path: "src/a.ts" },
    { timestamp: 2, type: "file_read", path: "src/a.ts" },
    { timestamp: 3, type: "file_read", path: "src/a.ts" }
  ], { now: new Date("2026-01-01T00:00:00Z") });
  assert.equal(report.metrics.toolLoopCount, 1);
});
