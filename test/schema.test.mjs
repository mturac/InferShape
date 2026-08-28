import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const name of ["session-event", "session-report", "repair-packet"]) {
  test(`${name} schema is valid JSON and closed where required`, () => {
    const schema = JSON.parse(readFileSync(new URL(`../schema/${name}.schema.json`, import.meta.url), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(typeof schema.title, "string");
    if (name !== "session-event") assert.equal(schema.additionalProperties, false);
  });
}
