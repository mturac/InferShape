import { sha256Hex } from "./canonical.js";
import { normalizeRecords } from "./normalize.js";
import { clampRatio, summarizeDistribution } from "./stats.js";
import type {
  AnalyzeOptions,
  Finding,
  JsonObject,
  NormalizedSessionEvent,
  SessionMetrics,
  SessionReport
} from "./types.js";

export const VERSION = "0.1.0";

interface FailureState {
  signature: string;
  family: string;
  hash: string | null;
  timestampMs: number;
  index: number;
}

function countExcess(values: string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function eventSignature(event: NormalizedSessionEvent): string {
  return [event.type, event.path ?? "", event.commandHash ?? "", event.operation ?? ""].join(":");
}

function detectToolLoops(events: NormalizedSessionEvent[]): { count: number; evidence: JsonObject[] } {
  let count = 0;
  const evidence: JsonObject[] = [];
  let previous = "";
  let runLength = 0;
  let runStart = 0;
  for (const event of events) {
    const signature = eventSignature(event);
    const loopEligible = event.type === "file_read" || event.type === "search" || event.type === "command_end" || event.type === "tool_call";
    if (!loopEligible) continue;
    if (signature === previous) {
      runLength += 1;
    } else {
      previous = signature;
      runLength = 1;
      runStart = event.index;
    }
    if (runLength === 3) {
      count += 1;
      evidence.push({ signature, startIndex: runStart, repeatedAtLeast: 3 });
    }
  }
  return { count, evidence };
}

function unresolvedFailures(events: NormalizedSessionEvent[]): FailureState[] {
  const state = new Map<string, FailureState>();
  for (const event of events) {
    if (event.type !== "command_end" && event.type !== "test_run" && event.type !== "tool_result" && event.type !== "verification") continue;
    const signature = event.commandHash ?? event.path ?? event.operation ?? `${event.type}:${event.index}`;
    if (event.outcome === "failure") {
      state.set(signature, {
        signature,
        family: event.commandFamily ?? event.operation ?? event.type,
        hash: event.commandHash ?? null,
        timestampMs: event.timestampMs,
        index: event.index
      });
    } else if (event.outcome === "success") {
      state.delete(signature);
    }
  }
  return [...state.values()].sort((left, right) => left.index - right.index);
}

function pathWithinScope(path: string, scopes: string[]): boolean {
  return scopes.length === 0 || scopes.some((scope) => {
    const normalized = scope.replace(/\/$/u, "");
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

function lastWriteIndex(events: NormalizedSessionEvent[]): number {
  let result = -1;
  for (const event of events) if (event.type === "file_write" || event.type === "file_delete") result = event.index;
  return result;
}

function lastPassingVerificationIndex(events: NormalizedSessionEvent[]): number {
  let result = -1;
  for (const event of events) {
    if ((event.type === "test_run" || event.type === "verification") && event.outcome === "success") result = event.index;
  }
  return result;
}

function computeVerifiedCompletion(events: NormalizedSessionEvent[], openFailures: FailureState[]): boolean {
  const claim = [...events].reverse().find((event) => event.type === "completion_claim" || event.type === "session_end");
  if (claim === undefined || (claim.claim !== "done" && claim.outcome !== "success")) return false;
  const writeIndex = lastWriteIndex(events);
  const verificationIndex = lastPassingVerificationIndex(events);
  return openFailures.length === 0 && verificationIndex > writeIndex;
}

function findingsFor(
  events: NormalizedSessionEvent[],
  metrics: SessionMetrics,
  loopEvidence: JsonObject[],
  openFailures: FailureState[],
  changedFiles: string[],
  scopePaths: string[]
): Finding[] {
  const findings: Finding[] = [];
  if (metrics.repeatedReadCount > 0) {
    findings.push({
      code: "IS101_REPEATED_EXPLORATION",
      severity: metrics.repeatedReadCount >= 8 ? "warning" : "info",
      title: "Repeated repository exploration",
      summary: `${metrics.repeatedReadCount} file reads repeated paths that had already been inspected.`,
      evidence: { repeatedReadCount: metrics.repeatedReadCount },
      recommendation: "Build a bounded repository context packet before editing and retain verified file facts across turns."
    });
  }
  if (metrics.patchChurnCount > 0) {
    findings.push({
      code: "IS102_PATCH_CHURN",
      severity: metrics.patchChurnCount >= 5 ? "warning" : "info",
      title: "Patch churn",
      summary: `${metrics.patchChurnCount} writes revisited files or returned to an earlier content hash.`,
      evidence: { patchChurnCount: metrics.patchChurnCount, repeatedWriteCount: metrics.repeatedWriteCount },
      recommendation: "Freeze the smallest accepted contract, write a failing test first, and avoid broad rewrites before the focused gate is green."
    });
  }
  if (metrics.toolLoopCount > 0) {
    findings.push({
      code: "IS103_TOOL_LOOP",
      severity: "warning",
      title: "Repeated tool loop",
      summary: `${metrics.toolLoopCount} consecutive tool pattern repeated at least three times.`,
      evidence: { loops: loopEvidence },
      recommendation: "Stop after the second identical failure, inspect the root cause, and change one variable before retrying."
    });
  }
  if (metrics.unresolvedFailureCount > 0) {
    findings.push({
      code: "IS104_UNRESOLVED_FAILURE",
      severity: "error",
      title: "Unresolved execution failures",
      summary: `${metrics.unresolvedFailureCount} failed command or verification signature never recovered.`,
      evidence: {
        failures: openFailures.map((failure) => ({ family: failure.family, commandHash: failure.hash, eventIndex: failure.index }))
      },
      recommendation: "Resume from the earliest unresolved failure and prove recovery with the same focused command or an explicitly superseding check."
    });
  }
  if (metrics.fullSuiteRunCount >= 3 && metrics.focusedTestRunCount === 0) {
    findings.push({
      code: "IS105_FULL_SUITE_THRASHING",
      severity: "warning",
      title: "Full-suite thrashing",
      summary: `${metrics.fullSuiteRunCount} full-suite runs occurred without a focused test run.`,
      evidence: { fullSuiteRunCount: metrics.fullSuiteRunCount, focusedTestRunCount: metrics.focusedTestRunCount },
      recommendation: "Use the smallest falsifiable test during development and reserve the full suite for integration and release gates."
    });
  }
  if (metrics.outsideScopeWriteCount > 0) {
    findings.push({
      code: "IS106_SCOPE_ESCAPE",
      severity: "error",
      title: "Writes outside declared scope",
      summary: `${metrics.outsideScopeWriteCount} write operations targeted paths outside the declared scope.`,
      evidence: { scopePaths, outsideScopeWriteCount: metrics.outsideScopeWriteCount },
      recommendation: "Revert unrelated writes or explicitly revise the task scope before continuing."
    });
  }
  if (metrics.falseCompletion) {
    findings.push({
      code: "IS107_FALSE_COMPLETION",
      severity: "error",
      title: "Completion claimed before proof",
      summary: "The session claimed completion without a successful verification after the final write or while failures remained open.",
      evidence: {
        lastWriteIndex: lastWriteIndex(events),
        lastPassingVerificationIndex: lastPassingVerificationIndex(events),
        unresolvedFailureCount: metrics.unresolvedFailureCount
      },
      recommendation: "Keep the task incomplete until a post-change focused gate and the required packaged journey both pass."
    });
  }
  if (changedFiles.length > 0 && metrics.passingTests === 0) {
    findings.push({
      code: "IS108_CHANGED_WITHOUT_GREEN_TEST",
      severity: "warning",
      title: "Changed files without a green test",
      summary: `${changedFiles.length} changed files were observed, but no passing test event was recorded.`,
      evidence: { changedFileCount: changedFiles.length },
      recommendation: "Run and record a focused executable check that covers the changed behavior."
    });
  }
  if (metrics.avoidableExplorationRatio >= 0.25) {
    findings.push({
      code: "IS109_CONTEXT_WASTE",
      severity: "warning",
      title: "High avoidable exploration ratio",
      summary: `${Math.round(metrics.avoidableExplorationRatio * 100)}% of read/search activity was repeated.`,
      evidence: { avoidableExplorationRatio: metrics.avoidableExplorationRatio },
      recommendation: "Carry forward stable repository facts and place volatile task state after reusable context."
    });
  }
  if (findings.length === 0) {
    findings.push({
      code: "IS100_NO_MATERIAL_ISSUES",
      severity: "info",
      title: "No material session-shape issue detected",
      summary: "The observed session did not cross any v0.1 diagnostic threshold.",
      evidence: { eventCount: metrics.eventCount },
      recommendation: "Retain the report as a baseline and compare future sessions against it."
    });
  }
  return findings;
}

export function analyzeEvents(events: NormalizedSessionEvent[], options: AnalyzeOptions = {}): SessionReport {
  if (events.length === 0) throw new Error("Cannot analyze an empty event list.");
  const start = events[0]?.timestampMs ?? 0;
  const end = events.at(-1)?.timestampMs ?? start;
  const readEvents = events.filter((event) => event.type === "file_read" && event.path !== undefined);
  const writeEvents = events.filter((event) => (event.type === "file_write" || event.type === "file_delete") && event.path !== undefined);
  const searchEvents = events.filter((event) => event.type === "search");
  const commandEvents = events.filter((event) => event.type === "command_end" || event.type === "test_run");
  const testEvents = events.filter((event) => event.type === "test_run");
  const readFiles = [...new Set(readEvents.map((event) => event.path as string))].sort();
  const changedFiles = [...new Set(writeEvents.map((event) => event.path as string))].sort();
  const scopePaths = [...new Set(events.flatMap((event) => event.scopePaths ?? []))].sort();
  const repeatedReadCount = countExcess(readEvents.map((event) => event.path as string));
  const repeatedWriteCount = countExcess(writeEvents.map((event) => event.path as string));
  const writeHashes = new Map<string, string[]>();
  for (const event of writeEvents) {
    const path = event.path as string;
    const hashes = writeHashes.get(path) ?? [];
    if (event.contentHash !== undefined) hashes.push(event.contentHash);
    writeHashes.set(path, hashes);
  }
  let reversalCount = 0;
  for (const hashes of writeHashes.values()) {
    const seen = new Set<string>();
    for (const hash of hashes) {
      if (seen.has(hash)) reversalCount += 1;
      seen.add(hash);
    }
  }
  const loops = detectToolLoops(events);
  const openFailures = unresolvedFailures(events);
  const firstEdit = writeEvents[0];
  const firstPassingTest = testEvents.find((event) => event.outcome === "success");
  const verifiedCompletion = computeVerifiedCompletion(events, openFailures);
  const completionEvent = verifiedCompletion
    ? [...events].reverse().find((event) => event.type === "completion_claim" || event.type === "session_end")
    : undefined;
  const claimedDone = events.some((event) => (event.type === "completion_claim" || event.type === "session_end") && (event.claim === "done" || event.outcome === "success"));
  const falseCompletion = claimedDone && !verifiedCompletion;
  const explorationCount = readEvents.length + searchEvents.length;
  const avoidableExplorationRatio = clampRatio(explorationCount === 0 ? 0 : (repeatedReadCount + Math.max(0, searchEvents.length - new Set(searchEvents.map(eventSignature)).size)) / explorationCount);
  const objective = events.find((event) => event.objectiveHash !== undefined);
  const metrics: SessionMetrics = {
    eventCount: events.length,
    durationMs: Math.max(0, end - start),
    fileReads: readEvents.length,
    fileWrites: events.filter((event) => event.type === "file_write").length,
    fileDeletes: events.filter((event) => event.type === "file_delete").length,
    searches: searchEvents.length,
    commands: commandEvents.length,
    failedCommands: commandEvents.filter((event) => event.outcome === "failure").length,
    passingTests: testEvents.filter((event) => event.outcome === "success").length,
    failingTests: testEvents.filter((event) => event.outcome === "failure").length,
    repeatedReadCount,
    repeatedWriteCount,
    patchChurnCount: repeatedWriteCount + reversalCount,
    toolLoopCount: loops.count,
    unresolvedFailureCount: openFailures.length,
    fullSuiteRunCount: testEvents.filter((event) => event.testScope === "full").length,
    focusedTestRunCount: testEvents.filter((event) => event.testScope === "focused").length,
    changedFileCount: changedFiles.length,
    outsideScopeWriteCount: writeEvents.filter((event) => event.path !== undefined && !pathWithinScope(event.path, scopePaths)).length,
    timeToFirstEditMs: firstEdit === undefined ? null : Math.max(0, firstEdit.timestampMs - start),
    timeToFirstPassingTestMs: firstPassingTest === undefined ? null : Math.max(0, firstPassingTest.timestampMs - start),
    timeToVerifiedCompletionMs: completionEvent === undefined ? null : Math.max(0, completionEvent.timestampMs - start),
    falseCompletion,
    verifiedCompletion,
    avoidableExplorationRatio,
    commandLatencyMs: summarizeDistribution(commandEvents.flatMap((event) => event.durationMs === undefined ? [] : [event.durationMs])),
    testLatencyMs: summarizeDistribution(testEvents.flatMap((event) => event.durationMs === undefined ? [] : [event.durationMs]))
  };
  const generatedAt = (options.now ?? new Date()).toISOString();
  const reportWithoutHash = {
    schemaVersion: "1" as const,
    kind: "infershape.session-report" as const,
    summary: {
      sessionId: events[0]?.sessionId ?? "unknown",
      sourceKinds: [...new Set(events.map((event) => event.source))].sort(),
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
      objectiveHash: objective?.objectiveHash ?? null,
      objectiveLength: objective?.objectiveLength ?? null,
      scopePaths,
      changedFiles,
      readFiles,
      reportVersion: "1" as const,
      analyzerVersion: VERSION
    },
    metrics,
    findings: findingsFor(events, metrics, loops.evidence, openFailures, changedFiles, scopePaths),
    generatedAt
  };
  const profileMaterial = {
    schemaVersion: reportWithoutHash.schemaVersion,
    kind: reportWithoutHash.kind,
    summary: reportWithoutHash.summary,
    metrics: reportWithoutHash.metrics,
    findings: reportWithoutHash.findings
  };
  return {
    ...reportWithoutHash,
    profileHash: sha256Hex(profileMaterial, "infershape.session-report")
  };
}

export function analyzeRecords(records: unknown[], options: AnalyzeOptions = {}): SessionReport {
  return analyzeEvents(normalizeRecords(records, options), options);
}

export function collectUnresolvedFailureEvidence(events: NormalizedSessionEvent[]): JsonObject[] {
  return unresolvedFailures(events).map((failure) => ({
    family: failure.family,
    commandHash: failure.hash,
    eventIndex: failure.index,
    timestamp: new Date(failure.timestampMs).toISOString()
  }));
}
