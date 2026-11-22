import { test } from "node:test";
import assert from "node:assert/strict";
import { mentorMatchScore, pickMentor } from "../src/lib/mentorship/matching";
import { groupRequests } from "../src/lib/mentorship/admin";

/**
 * Mentor matching tests (Track C): deterministic scoring over country, level,
 * field and language overlap, with load as the tie-breaker.
 */

const mentor = (over: Partial<Parameters<typeof mentorMatchScore>[0]> = {}) => ({
  userId: "m1",
  displayName: "Mentor One",
  countries: ["NL", "DE"],
  levels: ["master"],
  fields: ["Computer Science"],
  languages: ["English", "Bangla"],
  capacityPerWeek: 2,
  available: true,
  ...over,
});

const request = {
  targetCountry: "NL",
  level: "master",
  field: "Computer Science",
  language: "Bangla",
};

test("mentorMatchScore rewards country, level, field and language overlap", () => {
  // country +3, level +2, field +1, language +1 = 7
  assert.equal(mentorMatchScore(mentor(), request), 7);
});

test("mentorMatchScore gives partial scores for partial overlap", () => {
  const half = mentor({ fields: ["Law"], languages: ["English"] });
  // country +3, level +2, field 0, language 0 = 5
  assert.equal(mentorMatchScore(half, request), 5);
  const none = mentor({ countries: ["SE"], levels: ["phd"], fields: ["Law"], languages: ["Swedish"] });
  assert.equal(mentorMatchScore(none, request), 0);
});

test("pickMentor prefers the higher-scoring mentor and breaks ties by load", () => {
  const loaded = { ...mentor(), userId: "loaded", openCount: 3 };
  const free = { ...mentor({ userId: "free" }), openCount: 0 };
  const picked = pickMentor([loaded, free], request);
  assert.equal(picked?.userId, "free", "same score -> the less loaded mentor wins");
});

test("pickMentor returns null with no candidates", () => {
  assert.equal(pickMentor([], request), null);
});

test("groupRequests buckets the admin triage view", () => {
  const mk = (id: string, status: string) => ({ requestId: id, status }) as never;
  const g = groupRequests([mk("1", "open"), mk("2", "open"), mk("3", "matched"), mk("4", "accepted"), mk("5", "completed")]);
  assert.equal(g.open.length, 2);
  assert.equal(g.active.length, 2);
  assert.equal(g.completed.length, 1);
});
