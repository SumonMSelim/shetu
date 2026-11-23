/**
 * Deterministic evaluation checks (pure, unit-tested).
 *
 * These are the pass/fail gates of the eval suite: grounding (every figure in
 * an answer must appear in that turn's tool outputs), required and forbidden
 * phrases, and script detection (Bangla answers stay in Bangla). They never
 * call a model, so they are stable, free, and CI-safe.
 */

/** Map Bengali numerals to Western digits before any comparison. */
export function normalizeDigits(text: string): string {
  const bengali = "০১২৩৪৫৬৭৮৯";
  return text.replace(/[০-৯]/g, (d) => String(bengali.indexOf(d)));
}

/**
 * Figures of 3+ digits are the verifiable claims (fees, years, totals).
 * Smaller numbers (band scores, counts of two) are too noisy to assert.
 */
export function extractFigures(text: string): string[] {
  const normalized = normalizeDigits(text);
  const matches = normalized.match(/\d[\d.,]*\d|\d{3,}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/[.,]/g, "")))].filter((f) => f.length >= 3);
}

export interface GroundingResult {
  pass: boolean;
  /** Figures stated in the answer that no tool output contains. */
  ungrounded: string[];
}

/** Every 3+ digit figure in the answer must appear in some tool output.
 *  URLs are stripped from the answer first: links contain long numeric ids
 *  (Opintopolku oids, course codes) that are not factual claims. Both sides
 *  normalize separators identically so translated answers stay comparable. */
export function checkGrounding(answer: string, toolTexts: string[]): GroundingResult {
  const answerNoUrls = answer.replace(/https?:\/\/\S+/g, " ");
  const normalize = (t: string) => normalizeDigits(t).replace(/[.,](?=\d)/g, "");
  const haystack = normalize(toolTexts.join(" "));
  const ungrounded = extractFigures(answerNoUrls).filter((f) => !haystack.includes(f));
  return { pass: ungrounded.length === 0, ungrounded };
}

export interface Expectations {
  /** Every phrase (case-insensitive) must appear in the answer. */
  mustContain?: string[];
  /** Grounding gate: every 3+ digit figure must appear in tool outputs. */
  grounded?: boolean;
  /** Link gate: every Markdown link must point to a host seen in tool outputs. */
  groundedLinks?: boolean;
  /** No phrase (case-insensitive) may appear in the answer. */
  mustNotContain?: string[];
  /** At least one of these tools must have been called. */
  toolsMustInclude?: string[];
  /** At least one of these specialists must have been delegated to. */
  specialistsMustInclude?: string[];
  /** The answer must contain Bengali script (language-matching check). */
  bengaliScript?: boolean;
  /** The answer must contain no CJK (Chinese/Japanese) characters. */
  noCjk?: boolean;
  /** The answer must not contain the Latin apology line (language drift). */
  noEnglishSwitch?: boolean;
}

export interface ExpectResult {
  pass: boolean;
  failures: string[];
}

export function checkExpectations(
  answer: string,
  toolNames: string[],
  expect: Expectations,
  toolTexts: string[] = [],
  trustedDomains: string[] = [],
): ExpectResult {
  const failures: string[] = [];
  const normalized = normalizeDigits(answer);
  const lower = normalized.toLowerCase();

  if (expect.groundedLinks) {
    const allowed = new Set<string>(["mol.la", ...trustedDomains]);
    for (const t of toolTexts) {
      for (const m of t.matchAll(/https?:\/\/[^\s"' )\]]+/g)) {
        try {
          allowed.add(new URL(m[0]).hostname.replace(/^www\./, ""));
        } catch {
          // Unparseable URL in tool output: ignore.
        }
      }
    }
    for (const m of answer.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
      try {
        const host = new URL(m[2]).hostname.replace(/^www\./, "");
        const ok = [...allowed].some((d) => host === d || host.endsWith("." + d));
        if (!ok) failures.push(`link to unverified host: ${host} (text: "${m[1].slice(0, 60)}")`);
      } catch {
        failures.push(`link with unparseable href: ${m[2].slice(0, 80)}`);
      }
    }
  }

  for (const phrase of expect.mustContain ?? []) {
    if (!lower.includes(phrase.toLowerCase())) {
      failures.push(`missing required phrase: "${phrase}"`);
    }
  }
  for (const phrase of expect.mustNotContain ?? []) {
    if (lower.includes(phrase.toLowerCase())) {
      failures.push(`forbidden phrase present: "${phrase}"`);
    }
  }
  if (expect.toolsMustInclude && expect.toolsMustInclude.length > 0) {
    const anyTool = expect.toolsMustInclude.some((t) => toolNames.includes(t));
    if (!anyTool) {
      failures.push(`expected one of tools [${expect.toolsMustInclude.join(", ")}], got [${toolNames.join(", ") || "none"}]`);
    }
  }
  if (expect.specialistsMustInclude && expect.specialistsMustInclude.length > 0) {
    const anySpecialist = expect.specialistsMustInclude.some((s) => toolNames.includes(s));
    if (!anySpecialist) {
      failures.push(
        `expected one of specialists [${expect.specialistsMustInclude.join(", ")}], got [${toolNames.join(", ") || "none"}]`,
      );
    }
  }
  if (expect.bengaliScript && !/[\u0980-\u09FF]/.test(answer)) {
    failures.push("answer must contain Bengali script (language matching)");
  }
  if (expect.noEnglishSwitch && /answer in english/i.test(answer)) {
    failures.push("answer switched to English instead of mirroring the student's language");
  }
  if (expect.noCjk && /[\u4e00-\u9fff]/.test(normalized)) {
    failures.push("answer contains CJK characters (script drift into Chinese)");
  }
  return { pass: failures.length === 0, failures };
}
