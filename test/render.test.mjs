import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRecords, renderHtmlReport, renderMarkdownReport } from "../dist/index.js";

test("reports render without embedding sensitive input content", () => {
  const report = analyzeRecords([
    { timestamp: 1, type: "session_start", session_id: "s", prompt: "SECRET" },
    { timestamp: 2, type: "file_write", path: "src/a.ts", output: "SECRET" }
  ], { now: new Date("2026-01-01T00:00:00Z") });
  const markdown = renderMarkdownReport(report);
  const html = renderHtmlReport(report);
  assert.equal(markdown.includes("SECRET"), false);
  assert.equal(html.includes("SECRET"), false);
  assert.match(html, /<!doctype html>/u);
});
