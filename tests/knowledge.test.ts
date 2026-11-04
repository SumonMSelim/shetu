import { test } from "node:test";
import assert from "node:assert/strict";
import { getKnowledgeBase, availableCountries, DEFAULT_COUNTRY } from "../src/lib/knowledge/index";
import type { Provenance } from "../src/lib/knowledge/types";

/**
 * Knowledge-base integrity tests.
 *
 * Shetu's entire trustworthiness claim rests on one property: every fact the
 * agents can state is backed by a cited, verifiable source. These tests enforce
 * that property structurally, so a future data edit can't silently ship an
 * uncited "fact".
 */

function assertProvenance(where: string, p: Provenance | undefined) {
  assert.ok(p, `${where}: missing provenance`);
  assert.ok(p.source && p.source.trim().length > 0, `${where}: empty source`);
  assert.match(p.sourceUrl, /^https?:\/\//, `${where}: sourceUrl must be a URL`);
  assert.match(p.retrieved, /^\d{4}-\d{2}-\d{2}$/, `${where}: retrieved must be ISO date`);
}

test("registry exposes at least the default country", () => {
  const countries = availableCountries();
  assert.ok(countries.length >= 1);
  assert.ok(countries.some((c) => c.code === DEFAULT_COUNTRY));
});

test("unknown country throws a clear error", () => {
  assert.throws(() => getKnowledgeBase("ZZ"), /No knowledge base/);
});

test("every scholarship carries provenance and explicit caveats", () => {
  const kb = getKnowledgeBase("NL");
  assert.ok(kb.scholarships.length > 0);
  for (const s of kb.scholarships) {
    assertProvenance(`scholarship ${s.id}`, s.provenance);
    assert.ok(s.caveats.length > 0, `scholarship ${s.id}: must state at least one caveat`);
    assert.equal(typeof s.coversFullTuition, "boolean");
    assert.ok(s.levels.length > 0, `scholarship ${s.id}: must list levels`);
  }
});

test("every cost item has provenance, a currency, and a sane amount", () => {
  const kb = getKnowledgeBase("NL");
  assert.ok(kb.costs.length > 0);
  for (const c of kb.costs) {
    assertProvenance(`cost ${c.id}`, c.provenance);
    assert.equal(c.currency, kb.currency, `cost ${c.id}: currency should match KB currency`);
    assert.ok(c.amount >= 0, `cost ${c.id}: amount must be non-negative`);
    if (c.rangeLow !== undefined && c.rangeHigh !== undefined) {
      assert.ok(c.rangeLow <= c.rangeHigh, `cost ${c.id}: rangeLow must be <= rangeHigh`);
    }
  }
});

test("application, visa, and institution facts are all cited", () => {
  const kb = getKnowledgeBase("NL");
  for (const a of kb.applications) assertProvenance(`application ${a.id}`, a.provenance);
  for (const v of kb.visa) assertProvenance(`visa ${v.id}`, v.provenance);
  for (const i of kb.institutions) assertProvenance(`institution ${i.id}`, i.provenance);
});

test("red flags each state why and the honest reality", () => {
  const kb = getKnowledgeBase("NL");
  assert.ok(kb.redFlags.length > 0);
  for (const r of kb.redFlags) {
    assert.ok(r.claim.trim().length > 0, `red flag ${r.id}: empty claim`);
    assert.ok(r.why.trim().length > 0, `red flag ${r.id}: must explain why it is a flag`);
    assert.ok(r.reality.trim().length > 0, `red flag ${r.id}: must give the honest reality`);
  }
});

test("record ids are unique within each collection", () => {
  const kb = getKnowledgeBase("NL");
  const collections: Record<string, { id: string }[]> = {
    scholarships: kb.scholarships,
    costs: kb.costs,
    institutions: kb.institutions,
    applications: kb.applications,
    visa: kb.visa,
    redFlags: kb.redFlags,
  };
  for (const [name, items] of Object.entries(collections)) {
    const ids = items.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate id found`);
  }
});

test("the NL Scholarship is represented honestly (partial, one-off)", () => {
  const kb = getKnowledgeBase("NL");
  const nl = kb.scholarships.find((s) => s.id === "nl-scholarship");
  assert.ok(nl, "NL Scholarship must exist");
  assert.equal(nl.coversFullTuition, false, "NL Scholarship must not be claimed as full tuition");
});
