import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = new URL("../bin/infershape.mjs", import.meta.url).pathname;
const problem = new URL("../examples/problem-session.jsonl", import.meta.url).pathname;
const verified = new URL("../examples/verified-session.jsonl", import.meta.url).pathname;

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("CLI exposes version and help", () => {
  assert.equal(run(["--version"]).stdout.trim(), "0.1.0");
  assert.match(run(["--help"]).stdout, /infershape analyze/u);
});

test("analyze writes JSON, markdown, HTML, and repair packet", () => {
  const dir = mkdtempSync(join(tmpdir(), "infershape-cli-"));
  try {
    const result = run(["analyze", verified, "--json-out", join(dir, "report.json"), "--markdown-out", join(dir, "report.md"), "--html-out", join(dir, "report.html"), "--repair-out", join(dir, "repair.json")]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).kind, "infershape.session-report");
    assert.match(readFileSync(join(dir, "report.md"), "utf8"), /InferShape Session Report/u);
    assert.match(readFileSync(join(dir, "report.html"), "utf8"), /<!doctype html>/u);
    assert.equal(JSON.parse(readFileSync(join(dir, "repair.json"), "utf8")).kind, "infershape.repair-packet");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("quality gates use exit code 2", () => {
  const result = run(["analyze", problem, "--fail-on-false-completion"]);
  assert.equal(result.status, 2, result.stderr);
});

test("compare can fail on regression", () => {
  const dir = mkdtempSync(join(tmpdir(), "infershape-compare-"));
  try {
    assert.equal(run(["analyze", verified, "--json-out", join(dir, "good.json")]).status, 0);
    assert.equal(run(["analyze", problem, "--json-out", join(dir, "bad.json")]).status, 0);
    const result = run(["compare", join(dir, "good.json"), join(dir, "bad.json"), "--json", "--fail-on-regression"]);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).regressionCount > 0, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI rejects duplicate options", () => {
  const result = run(["analyze", verified, "--source", "generic", "--source", "auto"]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error.code, "IS_DUPLICATE_OPTION");
});
