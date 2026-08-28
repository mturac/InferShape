import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecords } from "../dist/index.js";

test("normalization strips prompt and output content", () => {
  const events = normalizeRecords([{
    timestamp: "2026-01-01T00:00:00Z",
    type: "tool_result",
    session_id: "sensitive-session",
    command: "npm test -- secret-token",
    prompt: "TOP SECRET PROMPT",
    output: "TOP SECRET OUTPUT",
    success: false
  }]);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("TOP SECRET"), false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(events[0].commandFamily, "npm:test");
  assert.equal(events[0].outcome, "failure");
});

test("normalization can opt in to command text", () => {
  const events = normalizeRecords([{ timestamp: 1, type: "command_end", command: "npm test -- focused", exit_code: 0 }], { includeCommandText: true });
  assert.equal(events[0].commandText, "npm test -- focused");
});

test("OpenTelemetry-shaped records normalize timing and source", () => {
  const events = normalizeRecords([{
    name: "tool.call Read",
    startTimeUnixNano: "1000000000",
    endTimeUnixNano: "1500000000",
    attributes: { "gen_ai.tool.name": "Read", "gen_ai.tool.arguments.path": "/repo/src/a.ts", session_id: "s" }
  }], { repoRoot: "/repo" });
  assert.equal(events[0].source, "opentelemetry");
  assert.equal(events[0].type, "file_read");
  assert.equal(events[0].path, "src/a.ts");
  assert.equal(events[0].durationMs, 500);
});

test("events sort by time and retain deterministic index", () => {
  const events = normalizeRecords([
    { timestamp: 2, type: "file_read", path: "b" },
    { timestamp: 1, type: "file_read", path: "a" }
  ]);
  assert.deepEqual(events.map((event) => [event.index, event.path]), [[0, "a"], [1, "b"]]);
});
