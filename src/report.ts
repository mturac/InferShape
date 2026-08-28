import type { Finding, SessionComparison, SessionReport } from "./types.js";

function duration(value: number | null): string {
  if (value === null) return "not reached";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
}

function findingLine(finding: Finding): string {
  return `### ${finding.severity.toUpperCase()} · ${finding.code} · ${finding.title}\n\n${finding.summary}\n\n**Recommendation:** ${finding.recommendation}`;
}

export function renderMarkdownReport(report: SessionReport): string {
  const status = report.metrics.verifiedCompletion ? "VERIFIED" : report.metrics.falseCompletion ? "FALSE COMPLETE" : "INCOMPLETE";
  return `# InferShape Session Report\n\n**Session:** \`${report.summary.sessionId}\`  \n**Status:** **${status}**  \n**Profile hash:** \`${report.profileHash}\`  \n**Window:** ${report.summary.startedAt} → ${report.summary.endedAt}\n\n## Outcome\n\n| Metric | Value |\n|---|---:|\n| Events | ${report.metrics.eventCount} |\n| Duration | ${duration(report.metrics.durationMs)} |\n| Time to first edit | ${duration(report.metrics.timeToFirstEditMs)} |\n| Time to first passing test | ${duration(report.metrics.timeToFirstPassingTestMs)} |\n| Time to verified completion | ${duration(report.metrics.timeToVerifiedCompletionMs)} |\n| Repeated reads | ${report.metrics.repeatedReadCount} |\n| Patch churn | ${report.metrics.patchChurnCount} |\n| Tool loops | ${report.metrics.toolLoopCount} |\n| Unresolved failures | ${report.metrics.unresolvedFailureCount} |\n| Full-suite runs | ${report.metrics.fullSuiteRunCount} |\n| Focused test runs | ${report.metrics.focusedTestRunCount} |\n| Changed files | ${report.metrics.changedFileCount} |\n| Avoidable exploration | ${Math.round(report.metrics.avoidableExplorationRatio * 100)}% |\n\n## Findings\n\n${report.findings.map(findingLine).join("\n\n")}\n\n## Changed files\n\n${report.summary.changedFiles.length === 0 ? "_None observed._" : report.summary.changedFiles.map((path) => `- \`${path}\``).join("\n")}\n`;
}

export function renderComparisonMarkdown(comparison: SessionComparison): string {
  const rows = comparison.deltas.map((delta) => `| ${String(delta.metric)} | ${String(delta.baseline)} | ${String(delta.candidate)} | ${delta.direction} |`).join("\n");
  return `# InferShape Comparison\n\n**Verdict:** **${comparison.verdict.toUpperCase()}**  \n**Regressions:** ${comparison.regressionCount}  \n**Improvements:** ${comparison.improvementCount}\n\n| Metric | Baseline | Candidate | Direction |\n|---|---:|---:|---|\n${rows}\n`;
}
