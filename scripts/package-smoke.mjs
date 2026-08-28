import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspace = mkdtempSync(join(tmpdir(), "infershape-package-"));
let tarball;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error([`${command} ${args.join(" ")} failed.`, result.stdout, result.stderr].filter(Boolean).join("\n"));
  return result;
}

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts"]).stdout);
  if (!Array.isArray(packed) || packed.length !== 1) throw new Error("Unexpected npm pack output.");
  const record = packed[0];
  tarball = join(root, record.filename);
  const allowed = new Set(["CHANGELOG.md", "LICENSE", "NOTICE", "README.md", "package.json"]);
  const prefixes = ["bin/", "dist/", "examples/", "schema/"];
  const unexpected = record.files.map((entry) => entry.path).filter((path) => !allowed.has(path) && !prefixes.some((prefix) => path.startsWith(prefix)));
  if (unexpected.length > 0) throw new Error(`Unexpected package files: ${unexpected.join(", ")}`);
  writeFileSync(join(workspace, "package.json"), '{"name":"infershape-smoke","private":true,"type":"module"}\n');
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", tarball], workspace);
  writeFileSync(join(workspace, "smoke.mjs"), `
import { VERSION, analyzeRecords, createRepairPacket, normalizeRecords } from "@mturac/infershape";
const records = [
  { timestamp: "2026-01-01T00:00:00Z", type: "session_start", session_id: "smoke" },
  { timestamp: "2026-01-01T00:00:01Z", type: "file_write", path: "src/a.ts" },
  { timestamp: "2026-01-01T00:00:02Z", type: "test_run", command: "npm test -- a", outcome: "success", test_scope: "focused" },
  { timestamp: "2026-01-01T00:00:03Z", type: "completion_claim", claim: "done" }
];
const events = normalizeRecords(records);
const report = analyzeRecords(records, { now: new Date("2026-01-01T00:00:04Z") });
const packet = createRepairPacket(report, events);
if (VERSION !== "0.1.0" || !report.metrics.verifiedCompletion || packet.status !== "verified") throw new Error("Installed API contract failed.");
`);
  run(process.execPath, [join(workspace, "smoke.mjs")], workspace);
  const cli = join(workspace, "node_modules", "@mturac", "infershape", "bin", "infershape.mjs");
  const version = run(process.execPath, [cli, "--version"], workspace).stdout.trim();
  if (version !== "0.1.0") throw new Error(`Installed CLI reported ${version}.`);
  const installed = JSON.parse(readFileSync(join(workspace, "node_modules", "@mturac", "infershape", "package.json"), "utf8"));
  if (installed.name !== "@mturac/infershape") throw new Error("Installed package name mismatch.");
  process.stdout.write(`Package smoke passed (${record.files.length} files, ${record.size} bytes).\n`);
} finally {
  if (tarball !== undefined) rmSync(tarball, { force: true });
  rmSync(workspace, { recursive: true, force: true });
}
