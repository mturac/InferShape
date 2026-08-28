import type { DistributionSummary } from "./types.js";

export function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function summarizeDistribution(values: number[]): DistributionSummary {
  if (values.length === 0) {
    return { count: 0, min: null, p50: null, p90: null, p95: null, p99: null, max: null, mean: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? null,
    mean: Number((sum / sorted.length).toFixed(3))
  };
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}
