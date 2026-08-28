import { sha256Hex } from "./canonical.js";
import { collectUnresolvedFailureEvidence } from "./analyze.js";
import type { NormalizedSessionEvent, RepairAction, RepairPacket, SessionReport } from "./types.js";

function actionsFromReport(report: SessionReport): RepairAction[] {
  const actions: RepairAction[] = [];
  let priority = 1;
  const add = (action: string, rationale: string, evidenceCodes: string[]): void => {
    actions.push({ priority, action, rationale, evidenceCodes });
    priority += 1;
  };
  const codes = new Set(report.findings.map((finding) => finding.code));
  if (codes.has("IS104_UNRESOLVED_FAILURE")) {
    add("Reproduce the earliest unresolved failure with the smallest focused command.", "A failed execution signature remained open at session end.", ["IS104_UNRESOLVED_FAILURE"]);
  }
  if (codes.has("IS107_FALSE_COMPLETION")) {
    add("Withdraw the completion claim and run verification after the final write.", "The recorded proof predates the final change or failures remain unresolved.", ["IS107_FALSE_COMPLETION"]);
  }
  if (codes.has("IS106_SCOPE_ESCAPE")) {
    add("Inspect and revert or explicitly authorize writes outside the declared scope.", "Out-of-scope changes make the handoff unsafe.", ["IS106_SCOPE_ESCAPE"]);
  }
  if (codes.has("IS102_PATCH_CHURN")) {
    add("Freeze a focused behavioral test before additional edits.", "Repeated rewrites indicate the implementation contract is not stable.", ["IS102_PATCH_CHURN"]);
  }
  if (codes.has("IS105_FULL_SUITE_THRASHING")) {
    add("Replace broad test retries with one focused failing test.", "Full-suite repetition is masking the first actionable failure.", ["IS105_FULL_SUITE_THRASHING"]);
  }
  if (actions.length === 0 && !report.metrics.verifiedCompletion) {
    add("Run a post-change focused verification and record its result.", "The session ended without a verified completion signal.", []);
  }
  return actions;
}

export function createRepairPacket(report: SessionReport, events: NormalizedSessionEvent[]): RepairPacket {
  const unresolvedFailures = collectUnresolvedFailureEvidence(events);
  const status: RepairPacket["status"] = report.metrics.verifiedCompletion
    ? "verified"
    : unresolvedFailures.length > 0
      ? "failed"
      : report.findings.some((finding) => finding.code === "IS106_SCOPE_ESCAPE")
        ? "blocked"
        : "incomplete";
  const verifiedFacts = [
    `${report.metrics.eventCount} normalized events were analyzed.`,
    `${report.metrics.changedFileCount} changed files were observed.`,
    `${report.metrics.passingTests} passing and ${report.metrics.failingTests} failing test events were recorded.`,
    report.metrics.verifiedCompletion ? "A passing verification occurred after the final write." : "No verified completion was established."
  ];
  const packetWithoutHash = {
    schemaVersion: "1" as const,
    kind: "infershape.repair-packet" as const,
    sessionId: report.summary.sessionId,
    sourceProfileHash: report.profileHash,
    status,
    objectiveHash: report.summary.objectiveHash,
    changedFiles: report.summary.changedFiles,
    unresolvedFailures,
    verifiedFacts,
    nextActions: actionsFromReport(report),
    safeResumeSummary: status === "verified"
      ? "The session is verified; no repair action is required."
      : `Resume session ${report.summary.sessionId} from the first unresolved obligation. Do not repeat repository discovery already represented by ${report.summary.readFiles.length} unique files.`
  };
  return { ...packetWithoutHash, packetHash: sha256Hex(packetWithoutHash, "infershape.repair-packet") };
}
