export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue; }

export type SessionEventType =
  | "session_start"
  | "objective"
  | "file_read"
  | "file_write"
  | "file_delete"
  | "search"
  | "command_start"
  | "command_end"
  | "test_run"
  | "tool_call"
  | "tool_result"
  | "completion_claim"
  | "verification"
  | "session_end"
  | "unknown";

export type EventOutcome = "success" | "failure" | "cancelled" | "unknown";

export interface NormalizedSessionEvent {
  index: number;
  timestampMs: number;
  type: SessionEventType;
  sessionId: string;
  source: "generic" | "opentelemetry" | "openinference" | "unknown";
  path?: string;
  operation?: string;
  commandFamily?: string;
  commandHash?: string;
  commandText?: string;
  outcome?: EventOutcome;
  exitCode?: number;
  durationMs?: number;
  bytes?: number;
  contentHash?: string;
  testScope?: "focused" | "full" | "unknown";
  objectiveHash?: string;
  objectiveLength?: number;
  scopePaths?: string[];
  claim?: "done" | "partial" | "blocked" | "unknown";
  metadata?: JsonObject;
}

export interface SessionInputOptions {
  source?: "auto" | "generic" | "opentelemetry" | "openinference";
  includeCommandText?: boolean;
  repoRoot?: string;
}

export interface Finding {
  code: string;
  severity: "info" | "warning" | "error";
  title: string;
  summary: string;
  evidence: JsonObject;
  recommendation: string;
}

export interface DistributionSummary {
  count: number;
  min: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  mean: number | null;
}

export interface SessionMetrics {
  eventCount: number;
  durationMs: number;
  fileReads: number;
  fileWrites: number;
  fileDeletes: number;
  searches: number;
  commands: number;
  failedCommands: number;
  passingTests: number;
  failingTests: number;
  repeatedReadCount: number;
  repeatedWriteCount: number;
  patchChurnCount: number;
  toolLoopCount: number;
  unresolvedFailureCount: number;
  fullSuiteRunCount: number;
  focusedTestRunCount: number;
  changedFileCount: number;
  outsideScopeWriteCount: number;
  timeToFirstEditMs: number | null;
  timeToFirstPassingTestMs: number | null;
  timeToVerifiedCompletionMs: number | null;
  falseCompletion: boolean;
  verifiedCompletion: boolean;
  avoidableExplorationRatio: number;
  commandLatencyMs: DistributionSummary;
  testLatencyMs: DistributionSummary;
}

export interface SessionSummary {
  sessionId: string;
  sourceKinds: string[];
  startedAt: string;
  endedAt: string;
  objectiveHash: string | null;
  objectiveLength: number | null;
  scopePaths: string[];
  changedFiles: string[];
  readFiles: string[];
  reportVersion: "1";
  analyzerVersion: string;
}

export interface SessionReport {
  schemaVersion: "1";
  kind: "infershape.session-report";
  summary: SessionSummary;
  metrics: SessionMetrics;
  findings: Finding[];
  profileHash: string;
  generatedAt: string;
}

export interface RepairAction {
  priority: number;
  action: string;
  rationale: string;
  evidenceCodes: string[];
}

export interface RepairPacket {
  schemaVersion: "1";
  kind: "infershape.repair-packet";
  sessionId: string;
  sourceProfileHash: string;
  status: "verified" | "incomplete" | "failed" | "blocked";
  objectiveHash: string | null;
  changedFiles: string[];
  unresolvedFailures: JsonObject[];
  verifiedFacts: string[];
  nextActions: RepairAction[];
  safeResumeSummary: string;
  packetHash: string;
}

export interface ComparisonDelta {
  metric: keyof SessionMetrics;
  baseline: number | boolean | null;
  candidate: number | boolean | null;
  direction: "improved" | "regressed" | "unchanged" | "not-comparable";
}

export interface SessionComparison {
  schemaVersion: "1";
  kind: "infershape.session-comparison";
  baselineProfileHash: string;
  candidateProfileHash: string;
  deltas: ComparisonDelta[];
  regressionCount: number;
  improvementCount: number;
  verdict: "improved" | "regressed" | "mixed" | "unchanged";
}

export interface AnalyzeOptions extends SessionInputOptions {
  now?: Date;
}
