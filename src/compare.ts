import type { ComparisonDelta, SessionComparison, SessionMetrics, SessionReport } from "./types.js";

const LOWER_IS_BETTER: (keyof SessionMetrics)[] = [
  "durationMs", "failedCommands", "failingTests", "repeatedReadCount", "repeatedWriteCount", "patchChurnCount",
  "toolLoopCount", "unresolvedFailureCount", "fullSuiteRunCount", "outsideScopeWriteCount", "avoidableExplorationRatio",
  "timeToFirstEditMs", "timeToFirstPassingTestMs", "timeToVerifiedCompletionMs"
];
const HIGHER_IS_BETTER: (keyof SessionMetrics)[] = ["passingTests", "focusedTestRunCount"];

function compareMetric(metric: keyof SessionMetrics, baseline: SessionMetrics, candidate: SessionMetrics): ComparisonDelta {
  const before = baseline[metric];
  const after = candidate[metric];
  if (typeof before === "boolean" && typeof after === "boolean") {
    const direction = metric === "verifiedCompletion"
      ? before === after ? "unchanged" : after ? "improved" : "regressed"
      : metric === "falseCompletion"
        ? before === after ? "unchanged" : after ? "regressed" : "improved"
        : "not-comparable";
    return { metric, baseline: before, candidate: after, direction };
  }
  if ((typeof before !== "number" && before !== null) || (typeof after !== "number" && after !== null)) {
    return { metric, baseline: null, candidate: null, direction: "not-comparable" };
  }
  if (before === null || after === null) {
    if (before === after) return { metric, baseline: before, candidate: after, direction: "unchanged" };
    return { metric, baseline: before, candidate: after, direction: "not-comparable" };
  }
  if (before === after) return { metric, baseline: before, candidate: after, direction: "unchanged" };
  if (LOWER_IS_BETTER.includes(metric)) return { metric, baseline: before, candidate: after, direction: after < before ? "improved" : "regressed" };
  if (HIGHER_IS_BETTER.includes(metric)) return { metric, baseline: before, candidate: after, direction: after > before ? "improved" : "regressed" };
  return { metric, baseline: before, candidate: after, direction: "not-comparable" };
}

export function compareReports(baseline: SessionReport, candidate: SessionReport): SessionComparison {
  const metrics: (keyof SessionMetrics)[] = [
    "durationMs", "failedCommands", "passingTests", "failingTests", "repeatedReadCount", "repeatedWriteCount",
    "patchChurnCount", "toolLoopCount", "unresolvedFailureCount", "fullSuiteRunCount", "focusedTestRunCount",
    "outsideScopeWriteCount", "timeToFirstEditMs", "timeToFirstPassingTestMs", "timeToVerifiedCompletionMs",
    "falseCompletion", "verifiedCompletion", "avoidableExplorationRatio"
  ];
  const deltas = metrics.map((metric) => compareMetric(metric, baseline.metrics, candidate.metrics));
  const regressionCount = deltas.filter((delta) => delta.direction === "regressed").length;
  const improvementCount = deltas.filter((delta) => delta.direction === "improved").length;
  const verdict: SessionComparison["verdict"] = regressionCount === 0 && improvementCount === 0
    ? "unchanged"
    : regressionCount === 0
      ? "improved"
      : improvementCount === 0
        ? "regressed"
        : "mixed";
  return {
    schemaVersion: "1",
    kind: "infershape.session-comparison",
    baselineProfileHash: baseline.profileHash,
    candidateProfileHash: candidate.profileHash,
    deltas,
    regressionCount,
    improvementCount,
    verdict
  };
}
