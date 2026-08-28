export { VERSION, analyzeEvents, analyzeRecords } from "./analyze.js";
export { canonicalJson, sha256Hex, stableIdentifier } from "./canonical.js";
export { compareReports } from "./compare.js";
export { InferShapeError } from "./errors.js";
export { renderHtmlReport } from "./html.js";
export { readRecords } from "./input.js";
export { normalizeRecords } from "./normalize.js";
export { createRepairPacket } from "./repair.js";
export { renderComparisonMarkdown, renderMarkdownReport } from "./report.js";
export { parseRepairPacket, parseSessionReport } from "./validation.js";
export type {
  AnalyzeOptions,
  ComparisonDelta,
  DistributionSummary,
  Finding,
  JsonObject,
  JsonValue,
  NormalizedSessionEvent,
  RepairAction,
  RepairPacket,
  SessionComparison,
  SessionEventType,
  SessionInputOptions,
  SessionMetrics,
  SessionReport,
  SessionSummary
} from "./types.js";
