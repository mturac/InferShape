import { basename, isAbsolute, relative, resolve } from "node:path";
import { stableIdentifier } from "./canonical.js";
import { InferShapeError } from "./errors.js";
import type {
  EventOutcome,
  JsonObject,
  NormalizedSessionEvent,
  SessionEventType,
  SessionInputOptions
} from "./types.js";

const CONTENT_KEYS = new Set([
  "content", "prompt", "completion", "input", "output", "messages", "message", "arguments", "result",
  "tool_arguments", "tool_result", "reasoning", "thinking", "response", "request_body", "response_body"
]);

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InferShapeError("IS_RECORD_NOT_OBJECT", "Every session record must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function firstString(object: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function firstNumber(object: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1e17) return Math.floor(value / 1e6);
    if (value > 1e14) return Math.floor(value / 1e3);
    if (value < 1e11) return Math.floor(value * 1000);
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") return parseTimestamp(numeric, fallback);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function classifyOutcome(object: Record<string, unknown>): EventOutcome | undefined {
  const exitCode = firstNumber(object, ["exit_code", "exitCode", "code"]);
  if (exitCode !== undefined) return exitCode === 0 ? "success" : "failure";
  const success = object.success;
  if (typeof success === "boolean") return success ? "success" : "failure";
  const raw = firstString(object, ["outcome", "status", "result_status", "state"]);
  if (raw === undefined) return undefined;
  const lowered = raw.toLowerCase();
  if (["ok", "success", "succeeded", "passed", "pass", "completed", "complete", "green"].includes(lowered)) return "success";
  if (["failed", "failure", "error", "errored", "red"].includes(lowered)) return "failure";
  if (["cancelled", "canceled", "aborted"].includes(lowered)) return "cancelled";
  return "unknown";
}

function inferType(object: Record<string, unknown>, sourceName: string, operation?: string): SessionEventType {
  const raw = firstString(object, ["type", "event", "event_type", "kind", "name", "action"])?.toLowerCase() ?? "";
  const tool = (firstString(object, ["tool", "tool_name", "function", "operation"]) ?? operation ?? "").toLowerCase();
  const combined = `${raw} ${tool} ${sourceName.toLowerCase()}`;

  if (/session[._ -]?start|run[._ -]?start/.test(combined)) return "session_start";
  if (/session[._ -]?end|run[._ -]?(end|finish)/.test(combined)) return "session_end";
  if (/objective|goal|task[._ -]?start/.test(combined)) return "objective";
  if (/completion[._ -]?claim|claim[._ -]?done|assistant[._ -]?final|final[._ -]?answer/.test(combined)) return "completion_claim";
  if (/verification|verify[._ -]?result|acceptance/.test(combined)) return "verification";
  if (/test|pytest|vitest|jest|playwright|go test|cargo test/.test(combined)) return "test_run";
  if (/file[._ -]?delete|unlink|remove[._ -]?file/.test(combined)) return "file_delete";
  if (/file[._ -]?(write|edit|patch)|\bwrite\b|\bedit\b|apply_patch|str_replace/.test(combined)) return "file_write";
  if (/file[._ -]?read|\bread\b|open_file|cat_file/.test(combined)) return "file_read";
  if (/search|grep|glob|find/.test(combined)) return "search";
  if (/command[._ -]?start|shell[._ -]?start|bash[._ -]?start/.test(combined)) return "command_start";
  if (/command[._ -]?(end|result)|shell[._ -]?(end|result)|bash[._ -]?(end|result)/.test(combined)) return "command_end";
  if (/tool[._ -]?call|function[._ -]?call/.test(combined)) return "tool_call";
  if (/tool[._ -]?result|function[._ -]?result/.test(combined)) return "tool_result";
  if (operation !== undefined) return "tool_call";
  return "unknown";
}

function normalizePath(raw: string | undefined, repoRoot: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.replaceAll("\\", "/").trim();
  if (cleaned.length === 0) return undefined;
  if (repoRoot !== undefined && isAbsolute(cleaned)) {
    const root = resolve(repoRoot);
    const relativePath = relative(root, cleaned).replaceAll("\\", "/");
    if (!relativePath.startsWith("../") && relativePath !== "..") return relativePath || ".";
    return `<outside-repo>/${basename(cleaned)}`;
  }
  return cleaned.replace(/^\.\//u, "");
}

function commandFamily(command: string | undefined, tool: string | undefined): string | undefined {
  const raw = command ?? tool;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const first = trimmed.split(/\s+/u)[0]?.toLowerCase() ?? "unknown";
  if (["npm", "pnpm", "yarn", "bun"].includes(first)) {
    const second = trimmed.split(/\s+/u)[1]?.toLowerCase();
    return second === "test" || second === "run" ? `${first}:${second ?? ""}` : first;
  }
  return first.replace(/[^a-z0-9_.-]/gu, "").slice(0, 40) || "unknown";
}

function testScope(command: string | undefined, object: Record<string, unknown>): "focused" | "full" | "unknown" | undefined {
  const explicit = firstString(object, ["test_scope", "scope"]);
  if (explicit === "focused" || explicit === "full") return explicit;
  if (command === undefined) return undefined;
  const lower = command.toLowerCase();
  if (/go test\s+\.\/\.\.\.|pytest(?:\s+-[^ ]+)*\s*$|npm test\s*$|pnpm test\s*$|yarn test\s*$|cargo test\s*$|vitest(?:\s+run)?\s*$/.test(lower)) return "full";
  if (/test|pytest|vitest|jest|playwright|go test|cargo test/.test(lower)) return "focused";
  return undefined;
}

function safeMetadata(object: Record<string, unknown>): JsonObject | undefined {
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(object)) {
    if (CONTENT_KEYS.has(key.toLowerCase())) continue;
    if (["timestamp", "time", "ts", "type", "event", "name", "path", "file", "file_path", "command", "cmd"].includes(key)) continue;
    if (typeof value === "string") {
      if (value.length <= 120 && !/secret|token|password|authorization|bearer/i.test(key)) result[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      result[key] = value;
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function unwrapAttributes(object: Record<string, unknown>): Record<string, unknown> {
  const attributes = object.attributes;
  if (typeof attributes === "object" && attributes !== null && !Array.isArray(attributes)) {
    return { ...object, ...(attributes as Record<string, unknown>) };
  }
  return object;
}

export function normalizeRecords(records: unknown[], options: SessionInputOptions = {}): NormalizedSessionEvent[] {
  const now = Date.now();
  const normalized: NormalizedSessionEvent[] = records.map((record, index) => {
    const original = asObject(record);
    const object = unwrapAttributes(original);
    const sourceName = firstString(object, ["source", "instrumentation_scope", "instrumentationScope", "openinference.span.kind"]) ?? "unknown";
    const source = sourceName.toLowerCase().includes("openinference") || "openinference.span.kind" in object
      ? "openinference"
      : ("startTimeUnixNano" in object || "endTimeUnixNano" in object || sourceName.toLowerCase().includes("otel"))
        ? "opentelemetry"
        : options.source === "generic"
          ? "generic"
          : "unknown";
    const operation = firstString(object, ["tool.name", "gen_ai.tool.name", "tool_name", "tool", "operation", "function"]);
    const rawCommand = firstString(object, ["command", "cmd", "shell_command", "tool.command", "gen_ai.tool.arguments.command"]);
    const path = normalizePath(firstString(object, ["path", "file", "file_path", "filepath", "tool.path", "gen_ai.tool.arguments.path"]), options.repoRoot);
    const timestampRaw = object.timestamp ?? object.time ?? object.ts ?? object.start_time ?? object.startTime;
    const startNano = object.startTimeUnixNano;
    const timestampMs = startNano !== undefined && Number.isFinite(Number(startNano))
      ? Math.floor(Number(startNano) / 1e6)
      : parseTimestamp(timestampRaw, now + index);
    const endTimestampRaw = object.end_time ?? object.endTime;
    const endNano = object.endTimeUnixNano;
    const endTimestampMs = endNano !== undefined && Number.isFinite(Number(endNano))
      ? Math.floor(Number(endNano) / 1e6)
      : endTimestampRaw === undefined ? undefined : parseTimestamp(endTimestampRaw, timestampMs);
    const durationMs = firstNumber(object, ["duration_ms", "durationMs", "latency_ms", "elapsed_ms"])
      ?? (endTimestampMs === undefined ? undefined : Math.max(0, endTimestampMs - timestampMs));
    const sessionRaw = firstString(object, ["session_id", "sessionId", "run_id", "runId", "trace_id", "traceId", "conversation_id"])
      ?? "default";
    const objective = firstString(object, ["objective", "goal", "task"]);
    const scopeRaw = object.scope_paths ?? object.scopePaths;
    const scopePaths = Array.isArray(scopeRaw)
      ? scopeRaw.filter((entry): entry is string => typeof entry === "string").map((entry) => normalizePath(entry, options.repoRoot) ?? entry)
      : undefined;
    const claimRaw = firstString(object, ["claim", "completion", "final_status"])?.toLowerCase();
    const claim = claimRaw === undefined ? undefined
      : claimRaw.includes("done") || claimRaw.includes("complete") ? "done"
        : claimRaw.includes("partial") ? "partial"
          : claimRaw.includes("block") ? "blocked"
            : "unknown";
    const type = inferType(object, sourceName, operation);
    const exitCode = firstNumber(object, ["exit_code", "exitCode", "code"]);
    const family = commandFamily(rawCommand, operation);
    const outcome = classifyOutcome(object);
    const bytes = firstNumber(object, ["bytes", "size", "byte_length"]);
    const contentHash = firstString(object, ["content_hash", "contentHash", "patch_hash", "diff_hash"]);
    const scope = testScope(rawCommand, object);
    const metadata = safeMetadata(object);
    const normalizedEvent: NormalizedSessionEvent = {
      index,
      timestampMs,
      type,
      sessionId: stableIdentifier(sessionRaw, "infershape.session"),
      source
    };
    if (path !== undefined) normalizedEvent.path = path;
    if (operation !== undefined) normalizedEvent.operation = operation.slice(0, 80);
    if (family !== undefined) normalizedEvent.commandFamily = family;
    if (rawCommand !== undefined) normalizedEvent.commandHash = stableIdentifier(rawCommand, "infershape.command");
    if (rawCommand !== undefined && options.includeCommandText === true) normalizedEvent.commandText = rawCommand;
    if (outcome !== undefined) normalizedEvent.outcome = outcome;
    if (exitCode !== undefined) normalizedEvent.exitCode = exitCode;
    if (durationMs !== undefined) normalizedEvent.durationMs = durationMs;
    if (bytes !== undefined) normalizedEvent.bytes = bytes;
    if (contentHash !== undefined) normalizedEvent.contentHash = contentHash;
    if (scope !== undefined) normalizedEvent.testScope = scope;
    if (objective !== undefined) {
      normalizedEvent.objectiveHash = stableIdentifier(objective, "infershape.objective");
      normalizedEvent.objectiveLength = objective.length;
    }
    if (scopePaths !== undefined) normalizedEvent.scopePaths = scopePaths;
    if (claim !== undefined) normalizedEvent.claim = claim;
    if (metadata !== undefined) normalizedEvent.metadata = metadata;
    return normalizedEvent;
  });

  normalized.sort((left, right) => left.timestampMs - right.timestampMs || left.index - right.index);
  return normalized.map((event, index) => ({ ...event, index }));
}
