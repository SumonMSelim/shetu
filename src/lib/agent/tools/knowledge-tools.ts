import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getKnowledgeBase, availableCountries, DEFAULT_COUNTRY } from "@/lib/knowledge";
import { isStaleProvenance } from "@/lib/knowledge/schema";
import { dbConfigured, dbPool } from "@/lib/db/postgres";
import { embedQuery } from "@/lib/db/embed";
import {
  fuseResults,
  jsonMatchScore,
  PROGRAMME_RANK_EXPR,
  rowToProgramme,
  type DbProgrammeRow,
} from "@/lib/knowledge/retrieval";
import { logWarn } from "@/lib/observability/logger";

/**
 * Time metadata every figure carries into the retrieval path: when it was last
 * verified against its source, and whether it is past the freshness budget.
 * The answering model uses these to present figures honestly (see the honesty
 * charter in prompts.ts).
 */
function withTime<T extends { id: string; provenance: { retrieved: string } }>(records: T[]) {
  return records.map((r) => ({
    ...r,
    verifiedOn: r.provenance.retrieved,
    stale: isStaleProvenance(r.provenance),
  }));
}

/**
 * Knowledge tools.
 *
 * These are the ONLY way the agents are allowed to obtain destination facts.
 * Each returns structured records that already include provenance, so the agent
 * can cite sources and is never forced to invent figures. Keeping facts behind
 * tools (rather than in the prompt) is what makes the advice grounded and
 * auditable, which is the core anti-misinformation design of Shetu.
 */

const countryField = z
  .string()
  .default(DEFAULT_COUNTRY)
  .describe("ISO country code of the destination, e.g. 'NL'. Defaults to NL.");

export const listDestinations = tool({
  name: "list_destinations",
  description:
    "List the study destinations Shetu currently has verified data for. Use this when the user asks where they can get help or picks a country.",
  inputSchema: z.object({}),
  callback: () => ({ destinations: availableCountries() }),
});

export const getScholarships = tool({
  name: "get_scholarships",
  description:
    "Get verified scholarships and funding options for a destination, including honest caveats (whether it covers full tuition, one-off vs recurring). Use for any funding, scholarship, or 'how do I pay' question.",
  inputSchema: z.object({ country: countryField }),
  callback: ({ country }) => {
    const kb = getKnowledgeBase(country);
    return { country: kb.country, scholarships: withTime(kb.scholarships) };
  },
});

export const getCosts = tool({
  name: "get_costs",
  description:
    "Get the verified, itemised cost of studying in a destination: tuition (statutory vs institutional), living costs, insurance, visa fees, and required proof of funds. Use for any budget, cost, or affordability question.",
  inputSchema: z.object({ country: countryField }),
  callback: ({ country }) => {
    const kb = getKnowledgeBase(country);
    return { country: kb.country, currency: kb.currency, costs: withTime(kb.costs) };
  },
});

export const getApplicationInfo = tool({
  name: "get_application_info",
  description:
    "Get verified application-process facts for a destination: deadlines, English-test requirements, numerus fixus, and how to find programmes. Use for 'how do I apply', deadlines, or requirements questions.",
  inputSchema: z.object({ country: countryField }),
  callback: ({ country }) => {
    const kb = getKnowledgeBase(country);
    return { country: kb.country, applications: kb.applications };
  },
});

export const getVisaInfo = tool({
  name: "get_visa_info",
  description:
    "Get verified visa and residence-permit facts for a destination: who needs a visa, the sponsor process, and proof-of-funds requirements. Use for any visa, permit, or immigration question.",
  inputSchema: z.object({ country: countryField }),
  callback: ({ country }) => {
    const kb = getKnowledgeBase(country);
    return { country: kb.country, visa: kb.visa };
  },
});

export const getInstitutions = tool({
  name: "get_institutions",
  description:
    "Get the types of institutions in a destination (e.g. research universities vs universities of applied sciences) to help the student choose the right kind of study.",
  inputSchema: z.object({ country: countryField }),
  callback: ({ country }) => {
    const kb = getKnowledgeBase(country);
    return { country: kb.country, institutions: kb.institutions };
  },
});

export const getRedFlags = tool({
  name: "get_red_flags",
  description:
    "Get known predatory-agency red flags for studying abroad, each paired with what an honest process actually looks like. Use whenever the student mentions an agency, a 'guarantee', an upfront fee, or asks whether an offer is legitimate.",
  inputSchema: z.object({ country: countryField }),
  callback: ({ country }) => {
    const kb = getKnowledgeBase(country);
    return { country: kb.country, redFlags: kb.redFlags };
  },
});

export const getProgrammes = tool({
  name: "get_programmes",
  description:
    "Search verified study programmes for a destination: fees, language, duration and the official programme page link. Supports natural-language search (query) plus filters (level, field, city). Use this when matching programmes or naming concrete options, and always give the programme page link so the student can verify figures themselves.",
  inputSchema: z.object({
    country: countryField,
    query: z
      .string()
      .optional()
      .describe("Natural-language search, e.g. 'master in artificial intelligence in Amsterdam'."),
    level: z.enum(["bachelor", "master", "phd"]).optional().describe("Filter by study level."),
    field: z
      .string()
      .optional()
      .describe("Filter by field or subject, e.g. 'Computer Science'."),
    city: z.string().optional().describe("Filter by city."),
  }),
  callback: async ({ country, level, field, city, query }) => {
    const cc = country.toLowerCase();
    const MAX_RESULTS = 15;

    // DB-backed hybrid retrieval (production): full-text + vector candidates
    // fused by reciprocal rank, over the validated records. On any database
    // problem the bundled JSON records take over, so the tool never fails.
    if (dbConfigured()) {
      try {
        const pool = dbPool();
        const cols =
          "id, name, institution, institution_type, level, field, language, city, duration_months, tuition_eu, tuition_non_eu, application_deadline, english_requirement, application_url, notes, provenance, verified_on, stale";
        const where =
          "country = $1 AND ($2::text IS NULL OR level = $2) AND ($3::text IS NULL OR city ILIKE '%' || $3 || '%') AND ($4::text IS NULL OR field ILIKE '%' || $4 || '%')";
        const params: unknown[] = [cc, level ?? null, city ?? null, field ?? null];
        // Field text contributes to relevance ranking rather than acting as a
        // hard filter (many records carry a general or missing field).
        const searchText = [query, field].filter(Boolean).join(" ").trim();

        const countQ = await pool.query(
          `SELECT count(*)::int AS total FROM programmes WHERE ${where}`,
          params,
        );
        const total = countQ.rows[0].total as number;
        let rows: DbProgrammeRow[] = [];

        if (searchText && total > 0) {
          const ftsParams = [...params, searchText];
          const fts = await pool.query(
            `SELECT ${cols}, ts_rank(${PROGRAMME_RANK_EXPR}, websearch_to_tsquery('english', $5)) AS rank
             FROM programmes WHERE ${where}
             AND (${PROGRAMME_RANK_EXPR}) @@ websearch_to_tsquery('english', $5)
             ORDER BY (ts_rank(${PROGRAMME_RANK_EXPR}, websearch_to_tsquery('english', $5))
               + CASE WHEN lower(name) LIKE '%' || lower($5) || '%' THEN 0.5 ELSE 0 END) DESC
             LIMIT ${MAX_RESULTS}`,
            ftsParams,
          );
          let vectorRows: DbProgrammeRow[] = [];
          try {
            const embeddingText = await embedQuery(searchText);
            const vec = await pool.query(
              `SELECT ${cols} FROM programmes WHERE ${where}
               AND embedding IS NOT NULL
               ORDER BY embedding <=> $5::vector
               LIMIT ${MAX_RESULTS}`,
              ftsParams,
            );
            vectorRows = vec.rows;
          } catch {
            // Vector path is an enhancement: keyword results still stand.
          }
          rows = fuseResults(fts.rows as DbProgrammeRow[], vectorRows);
        } else {
          const browse = await pool.query(
            `SELECT ${cols} FROM programmes WHERE ${where}
             ORDER BY verified_on DESC, id LIMIT ${MAX_RESULTS}`,
            params,
          );
          rows = browse.rows;
        }

        const programmes = rows.map(rowToProgramme);
        return {
          country: cc,
          total,
          shown: programmes.length,
          programmes,
          ...(total > programmes.length
            ? {
                hint: `${total - programmes.length} more match. Narrow the search text, city, field, or level.`,
              }
            : {}),
        };
      } catch (err) {
        logWarn("programmes.db_fallback", err, { country: cc });
      }
    }

    // Bundled-JSON fallback (local dev without DB access, CI, DB outage).
    const kb = getKnowledgeBase(country);
    let list = kb.programmes;
    if (level) list = list.filter((p) => p.level === level);
    if (city) {
      const c = city.toLowerCase();
      list = list.filter((p) => p.city.toLowerCase().includes(c));
    }
    const search = (query ?? field ?? "").trim();
    if (search) {
      // Match-quality ranking mirrors the weighted tsvector: name most, then
      // field, then institution and notes.
      list = list
        .map((p) => ({
          p,
          score: jsonMatchScore(
            { name: p.name, field: p.field, institution: p.institution, notes: p.notes },
            search.toLowerCase(),
          ),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.p);
    }
    const total = list.length;
    const shown = list.slice(0, MAX_RESULTS);
    return {
      country: kb.country,
      total,
      shown: shown.length,
      programmes: withTime(shown),
      ...(total > MAX_RESULTS
        ? { hint: `${total - MAX_RESULTS} more match. Ask for a narrower field, city, or level.` }
        : {}),
    };
  },
});

/** All knowledge tools, for convenient registration. */
export const knowledgeTools = [
  listDestinations,
  getScholarships,
  getCosts,
  getProgrammes,
  getApplicationInfo,
  getVisaInfo,
  getInstitutions,
  getRedFlags,
];
