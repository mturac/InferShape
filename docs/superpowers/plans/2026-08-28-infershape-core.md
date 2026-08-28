# InferShape Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic local CLI and TypeScript library that diagnoses coding-agent session failure shapes and produces privacy-safe repair handoffs.

**Architecture:** A source-tolerant normalizer strips content and emits versioned normalized events. A deterministic analyzer computes session metrics and evidence-backed findings, then report, HTML, repair, and comparison modules render versioned artifacts without network calls.

**Tech Stack:** TypeScript 5.8.3, Node.js 22+, Node test runner, built-in crypto/filesystem/path modules, zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-infershape-design.md`

## Global Constraints

- Node.js 22 or newer.
- Apache-2.0.
- Zero runtime dependencies and zero network calls.
- Never persist prompt, completion, message, reasoning, tool-argument, or tool-result content.
- Raw command text is opt-in only.
- Every quality claim is backed by an executable test.
- README hero is a validated 1536x860 PNG committed to the repository.

---

### Task 1: Canonical contracts and privacy-safe normalization

**Files:** `src/types.ts`, `src/errors.ts`, `src/canonical.ts`, `src/input.ts`, `src/normalize.ts`, `schema/session-event.schema.json`, `test/canonical.test.mjs`, `test/normalize.test.mjs`

**Produces:** `normalizeRecords(records, options)`, canonical JSON and domain-separated hashes.

- [x] Write failing tests for content stripping, pseudonymization, OTel nanosecond timing, path normalization, and deterministic ordering.
- [x] Implement the smallest typed normalized event contract.
- [x] Run `npm run build && node --test test/canonical.test.mjs test/normalize.test.mjs`.

### Task 2: Session-shape analyzer

**Files:** `src/stats.ts`, `src/analyze.ts`, `test/analyze.test.mjs`

**Produces:** `analyzeEvents()` and `analyzeRecords()` returning `SessionReport`.

- [x] Write failing cases for repeated reads, churn, loops, unresolved failures, suite thrashing, scope escape, and false completion.
- [x] Implement deterministic metrics and findings.
- [x] Prove profile hashes are stable when only generation time changes.

### Task 3: Repair and comparison contracts

**Files:** `src/repair.ts`, `src/compare.ts`, `schema/repair-packet.schema.json`, `schema/session-report.schema.json`, `test/repair-compare.test.mjs`

**Produces:** `createRepairPacket()` and `compareReports()`.

- [x] Write failing tests for safe repair actions, raw-command exclusion, and improved/regressed verdicts.
- [x] Implement versioned artifacts and deterministic packet hashes.

### Task 4: Human reports and CLI

**Files:** `src/report.ts`, `src/html.ts`, `src/validation.ts`, `src/cli.ts`, `src/index.ts`, `bin/infershape.mjs`, `test/render.test.mjs`, `test/cli.test.mjs`

**Produces:** `analyze`, `inspect`, and `compare` commands plus public TypeScript API.

- [x] Write CLI tests for all file outputs and exit code 2 quality gates.
- [x] Implement atomic writes, typed JSON errors, escaped self-contained HTML, and duplicate-option rejection.

### Task 5: OSS delivery and package proof

**Files:** `README.md`, `docs/assets/infershape-hero.png`, `examples/*`, `scripts/*`, `.github/*`, `LICENSE`, `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`

**Produces:** A clean public repository and installable npm tarball.

- [x] Create a product-specific README and real PNG hero.
- [x] Verify PNG signature, dimensions, size, and README reference.
- [x] Pack and install the exact tarball into a temporary consumer.
- [x] Run `npm run verify` on Node.js 22 and 24 in hosted CI before merge.
