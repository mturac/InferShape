import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { analyzeEvents, VERSION } from "./analyze.js";
import { compareReports } from "./compare.js";
import { InferShapeError } from "./errors.js";
import { renderHtmlReport } from "./html.js";
import { readRecords } from "./input.js";
import { normalizeRecords } from "./normalize.js";
import { createRepairPacket } from "./repair.js";
import { renderComparisonMarkdown, renderMarkdownReport } from "./report.js";
import { parseSessionReport } from "./validation.js";
import type { SessionInputOptions } from "./types.js";

interface ParsedArgs {
  command?: string;
  positionals: string[];
  options: Map<string, string | true>;
}

const HELP = `InferShape ${VERSION}\n\nUsage:\n  infershape analyze <session.jsonl|json|-> [options]\n  infershape inspect <report.json> [--json]\n  infershape compare <baseline.json> <candidate.json> [--json] [--fail-on-regression]\n  infershape --version\n  infershape --help\n\nAnalyze options:\n  --source <auto|generic|opentelemetry|openinference>\n  --repo <path>\n  --include-command-text\n  --json-out <path>\n  --markdown-out <path>\n  --html-out <path>\n  --repair-out <path>\n  --fail-on-false-completion\n  --fail-on-open-failures\n\nExit codes:\n  0 success\n  1 invalid input or operational failure\n  2 requested quality gate failed\n`;

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { positionals: [], options: new Map() };
  const args = [...argv];
  if (args[0] !== undefined && !args[0].startsWith("-")) {
    const command = args.shift();
    if (command !== undefined) result.command = command;
  }
  while (args.length > 0) {
    const arg = args.shift() as string;
    if (!arg.startsWith("--")) {
      result.positionals.push(arg);
      continue;
    }
    if (result.options.has(arg)) throw new InferShapeError("IS_DUPLICATE_OPTION", `Option ${arg} was provided more than once.`);
    if (["--include-command-text", "--json", "--fail-on-regression", "--fail-on-false-completion", "--fail-on-open-failures", "--help", "--version"].includes(arg)) {
      result.options.set(arg, true);
      continue;
    }
    const value = args.shift();
    if (value === undefined || value.startsWith("--")) throw new InferShapeError("IS_MISSING_OPTION_VALUE", `Option ${arg} requires a value.`);
    result.options.set(arg, value);
  }
  return result;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content);
  await rename(temp, absolute);
}

function stringOption(args: ParsedArgs, name: string): string | undefined {
  const value = args.options.get(name);
  return typeof value === "string" ? value : undefined;
}

function inputOptions(args: ParsedArgs): SessionInputOptions {
  const source = stringOption(args, "--source");
  if (source !== undefined && !["auto", "generic", "opentelemetry", "openinference"].includes(source)) {
    throw new InferShapeError("IS_INVALID_SOURCE", `Unsupported source ${source}.`);
  }
  const options: SessionInputOptions = {};
  if (source !== undefined) options.source = source as NonNullable<SessionInputOptions["source"]>;
  if (args.options.has("--include-command-text")) options.includeCommandText = true;
  const repoRoot = stringOption(args, "--repo");
  if (repoRoot !== undefined) options.repoRoot = repoRoot;
  return options;
}

async function analyzeCommand(args: ParsedArgs): Promise<number> {
  const input = args.positionals[0];
  if (input === undefined || args.positionals.length !== 1) throw new InferShapeError("IS_USAGE", "analyze requires exactly one input path.");
  const options = inputOptions(args);
  const events = normalizeRecords(await readRecords(input), options);
  const report = analyzeEvents(events);
  const repair = createRepairPacket(report, events);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(json);
  const jsonOut = stringOption(args, "--json-out");
  const markdownOut = stringOption(args, "--markdown-out");
  const htmlOut = stringOption(args, "--html-out");
  const repairOut = stringOption(args, "--repair-out");
  if (jsonOut !== undefined) await atomicWrite(jsonOut, json);
  if (markdownOut !== undefined) await atomicWrite(markdownOut, renderMarkdownReport(report));
  if (htmlOut !== undefined) await atomicWrite(htmlOut, renderHtmlReport(report));
  if (repairOut !== undefined) await atomicWrite(repairOut, `${JSON.stringify(repair, null, 2)}\n`);
  if (args.options.has("--fail-on-false-completion") && report.metrics.falseCompletion) return 2;
  if (args.options.has("--fail-on-open-failures") && report.metrics.unresolvedFailureCount > 0) return 2;
  return 0;
}

async function readReport(path: string): Promise<ReturnType<typeof parseSessionReport>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new InferShapeError("IS_INVALID_REPORT_JSON", `Could not parse report ${path}.`, { cause: String(error) });
  }
  return parseSessionReport(parsed);
}

async function inspectCommand(args: ParsedArgs): Promise<number> {
  const path = args.positionals[0];
  if (path === undefined || args.positionals.length !== 1) throw new InferShapeError("IS_USAGE", "inspect requires exactly one report path.");
  const report = await readReport(path);
  process.stdout.write(args.options.has("--json") ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdownReport(report));
  return 0;
}

async function compareCommand(args: ParsedArgs): Promise<number> {
  if (args.positionals.length !== 2) throw new InferShapeError("IS_USAGE", "compare requires baseline and candidate report paths.");
  const baselinePath = args.positionals[0] as string;
  const candidatePath = args.positionals[1] as string;
  const comparison = compareReports(await readReport(baselinePath), await readReport(candidatePath));
  process.stdout.write(args.options.has("--json") ? `${JSON.stringify(comparison, null, 2)}\n` : renderComparisonMarkdown(comparison));
  return args.options.has("--fail-on-regression") && comparison.regressionCount > 0 ? 2 : 0;
}

export async function runCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === undefined) {
    if (args.options.has("--version")) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    process.stdout.write(HELP);
    return args.options.has("--help") ? 0 : 1;
  }
  if (args.options.has("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  switch (args.command) {
    case "analyze": return analyzeCommand(args);
    case "inspect": return inspectCommand(args);
    case "compare": return compareCommand(args);
    default: throw new InferShapeError("IS_UNKNOWN_COMMAND", `Unknown command ${args.command}.`);
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    process.exitCode = await runCli(argv);
  } catch (error) {
    if (error instanceof InferShapeError) {
      process.stderr.write(`${JSON.stringify({ error: { code: error.code, message: error.message, details: error.details ?? null } })}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`${JSON.stringify({ error: { code: "IS_UNEXPECTED", message: error instanceof Error ? error.message : String(error) } })}\n`);
    process.exitCode = 1;
  }
}
