import { createHash } from "node:crypto";
import { InferShapeError } from "./errors.js";
import type { JsonValue } from "./types.js";

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = left.charCodeAt(index) - right.charCodeAt(index);
    if (delta !== 0) return delta;
  }
  return left.length - right.length;
}

function normalize(value: unknown, seen: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InferShapeError("IS_NON_FINITE_JSON", "Canonical JSON cannot encode non-finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new InferShapeError("IS_CIRCULAR_JSON", "Canonical JSON cannot encode circular arrays.");
    seen.add(value);
    const result = value.map((entry, index) => {
      if (!(index in value)) throw new InferShapeError("IS_SPARSE_ARRAY", "Canonical JSON rejects sparse arrays.");
      return normalize(entry, seen);
    });
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (seen.has(object)) throw new InferShapeError("IS_CIRCULAR_JSON", "Canonical JSON cannot encode circular objects.");
    seen.add(object);
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(object).sort(compareCodeUnits)) {
      const entry = object[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
        throw new InferShapeError("IS_UNREPRESENTABLE_JSON", `Canonical JSON cannot encode property ${key}.`);
      }
      result[key] = normalize(entry, seen);
    }
    seen.delete(object);
    return result;
  }
  throw new InferShapeError("IS_UNREPRESENTABLE_JSON", `Canonical JSON cannot encode ${typeof value}.`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set()));
}

export function sha256Hex(value: unknown, domain = "infershape"): string {
  return createHash("sha256").update(`${domain}\0${canonicalJson(value)}`).digest("hex");
}

export function stableIdentifier(value: string, domain: string): string {
  return sha256Hex(value, domain).slice(0, 24);
}
