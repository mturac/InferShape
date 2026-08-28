import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEvents, analyzeRecords, compareReports, createRepairPacket, normalizeRecords } from "../dist/index.js";

const failedRecords = [
  { timestamp: 1, type: "session_start", session_id: "s", objective: "fix" },
  { timestamp: 2, type: "file_write", path: "src/a.ts" },
  { timestamp: 3, type: "test_run", command: "npm test -- a", outcome: "failure", test_scope: "focused" },
  { timestamp: 4, type: "completion_claim", claim: "done" }
];
const verifiedRecords = [
  { timestamp: 1, type: "session_start", session_id: "s", objective: "fix" },
  { timestamp: 2, type: "file_write", path: "src/a.ts" },
  { timestamp: 3, type: "test_run", command: "npm test -- a", outcome: "success", test_scope: "focused" },
  { timestamp: 4, type: "completion_claim", claim: "done" }
];

test("repair packet is privacy-safe and actionable", () => {
  const events = normalizeRecords(failedRecords);
  const report = analyzeEvents(events, { now: new Date("2026-01-01T00:00:00Z") });
  const packet = createRepairPacket(report, events);
  assert.equal(packet.status, "failed");
  assert.equal(packet.nextActions.length > 0, true);
  assert.match(packet.packetHash, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(packet).includes("npm test -- a"), false);
});

test("comparison detects candidate improvement", () => {
  const baseline = analyzeRecords(failedRecords, { now: new Date("2026-01-01T00:00:00Z") });
  const candidate = analyzeRecords(verifiedRecords, { now: new Date("2026-01-01T00:00:00Z") });
  const comparison = compareReports(baseline, candidate);
  assert.equal(comparison.regressionCount, 0);
  assert.equal(comparison.improvementCount > 0, true);
  assert.equal(comparison.verdict, "improved");
});
