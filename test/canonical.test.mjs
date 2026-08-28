import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256Hex, stableIdentifier } from "../dist/index.js";

test("canonicalJson sorts object keys and preserves arrays", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } }), '{"a":{"x":[3,1],"y":2},"z":1}');
});

test("canonicalJson rejects circular and non-finite values", () => {
  const value = {}; value.self = value;
  assert.throws(() => canonicalJson(value), (error) => error?.code === "IS_CIRCULAR_JSON");
  assert.throws(() => canonicalJson({ value: Infinity }), (error) => error?.code === "IS_NON_FINITE_JSON");
});

test("domain-separated hashes are stable", () => {
  assert.equal(sha256Hex({ b: 2, a: 1 }), sha256Hex({ a: 1, b: 2 }));
  assert.notEqual(stableIdentifier("same", "session"), stableIdentifier("same", "command"));
  assert.equal(stableIdentifier("same", "session").length, 24);
});
