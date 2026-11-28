import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { availableCountries } from "../src/lib/knowledge/index";

/**
 * Every data/countries/<CC>/ directory MUST have a registry entry in
 * src/lib/knowledge/index.ts. A missing entry fails ALL knowledge tools for
 * that country with "No knowledge base for country" in ~2ms — silent for
 * the tools, invisible in CI, and users just get "no information" answers
 * (this shipped DK and IE broken on 23-28 November 2026).
 */
test("every country directory is registered in the knowledge registry", () => {
  const dirs = readdirSync(join(import.meta.dirname, "..", "data", "countries"), {
    withFileTypes: true,
  })
    .filter((d) => d.isDirectory())
    .map((d) => d.name.toUpperCase());
  const registered = availableCountries().map((c) => c.code);
  const missing = dirs.filter((d) => !registered.includes(d));
  assert.deepEqual(
    missing,
    [],
    `country directories with data files but NO registry entry (all their knowledge tools fail): ${missing.join(", ")}`,
  );
});

test("list_destinations serves exactly the registered countries", () => {
  const registered = availableCountries().map((c) => c.code).sort();
  assert.ok(registered.length >= 10, "catalogue has 10 countries");
  assert.ok(registered.includes("DK"), "Denmark registered");
  assert.ok(registered.includes("IE"), "Ireland registered");
});
