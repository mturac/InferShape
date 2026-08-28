import { readFile } from "node:fs/promises";
import { InferShapeError } from "./errors.js";

export async function readRecords(path: string): Promise<unknown[]> {
  const text = path === "-" ? await readStdin() : await readFile(path, "utf8");
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new InferShapeError("IS_EMPTY_INPUT", "Input contains no records.");

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "object" && parsed !== null) {
        const object = parsed as Record<string, unknown>;
        for (const key of ["events", "spans", "records", "data"]) {
          if (Array.isArray(object[key])) return object[key] as unknown[];
        }
        return [parsed];
      }
    } catch (error) {
      if (!trimmed.includes("\n")) {
        throw new InferShapeError("IS_INVALID_JSON", "Input is not valid JSON.", { cause: String(error) });
      }
    }
  }

  const records: unknown[] = [];
  for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new InferShapeError("IS_INVALID_JSONL", `Invalid JSON on line ${lineIndex + 1}.`, { cause: String(error) });
    }
  }
  if (records.length === 0) throw new InferShapeError("IS_EMPTY_INPUT", "Input contains no JSONL records.");
  return records;
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let result = "";
  for await (const chunk of process.stdin) {
    result += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
  }
  return result;
}
