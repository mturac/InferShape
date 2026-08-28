import { InferShapeError } from "./errors.js";
import type { RepairPacket, SessionReport } from "./types.js";

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InferShapeError("IS_INVALID_ARTIFACT", `${name} must be an object.`);
  return value as Record<string, unknown>;
}

export function parseSessionReport(value: unknown): SessionReport {
  const record = object(value, "Session report");
  if (record.schemaVersion !== "1" || record.kind !== "infershape.session-report") throw new InferShapeError("IS_INVALID_REPORT", "Unsupported session report schema.");
  object(record.summary, "Session report summary");
  object(record.metrics, "Session report metrics");
  if (!Array.isArray(record.findings) || typeof record.profileHash !== "string") throw new InferShapeError("IS_INVALID_REPORT", "Malformed session report.");
  return value as SessionReport;
}

export function parseRepairPacket(value: unknown): RepairPacket {
  const record = object(value, "Repair packet");
  if (record.schemaVersion !== "1" || record.kind !== "infershape.repair-packet") throw new InferShapeError("IS_INVALID_REPAIR_PACKET", "Unsupported repair packet schema.");
  if (typeof record.packetHash !== "string" || !Array.isArray(record.nextActions)) throw new InferShapeError("IS_INVALID_REPAIR_PACKET", "Malformed repair packet.");
  return value as RepairPacket;
}
