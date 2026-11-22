/**
 * Mentor matching (pure, unit-tested).
 *
 * Deterministic scoring: a mentor scores points for country, level, field and
 * language overlap with the student's request. The best score wins; ties are
 * broken by the least-active mentor (fewest open assignments), so load spreads.
 */

export interface MentorLike {
  userId: string;
  displayName: string;
  countries: string[];
  levels: string[];
  fields: string[];
  languages: string[];
  capacityPerWeek: number;
  available: boolean;
}

export interface RequestLike {
  targetCountry?: string;
  level?: string;
  field?: string;
  language?: string;
}

export function mentorMatchScore(
  mentor: MentorLike,
  request: RequestLike,
): number {
  let score = 0;
  const target = request.targetCountry?.toUpperCase();
  if (target && mentor.countries.map((c) => c.toUpperCase()).includes(target)) score += 3;
  if (request.level && mentor.levels.map((l) => l.toLowerCase()).includes(request.level.toLowerCase()))
    score += 2;
  if (
    request.field &&
    mentor.fields.some((f) => f.toLowerCase().includes(request.field!.toLowerCase()))
  )
    score += 1;
  if (request.language && mentor.languages.map((l) => l.toLowerCase()).includes(request.language.toLowerCase()))
    score += 1;
  return score;
}

/**
 * Pick the best mentor from candidates. All candidates must already be
 * `available`; load (open assignments) breaks ties. Returns null when the
 * candidate list is empty.
 */
export function pickMentor<T extends MentorLike & { openCount: number }>(
  candidates: T[],
  request: RequestLike,
): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const diff = mentorMatchScore(b, request) - mentorMatchScore(a, request);
    if (diff !== 0) return diff;
    return a.openCount - b.openCount;
  })[0];
}
