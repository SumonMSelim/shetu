import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getKnowledgeBase, availableCountries, DEFAULT_COUNTRY } from "@/lib/knowledge";
import { isStaleProvenance } from "@/lib/knowledge/schema";

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
    "Get verified study programmes for a destination, with fees, language, duration and the official programme page link. Use this when matching programmes or naming concrete options, and always give the programme page link so the student can verify figures themselves.",
  inputSchema: z.object({
    country: countryField,
    level: z.enum(["bachelor", "master", "phd"]).optional().describe("Filter by study level."),
    field: z
      .string()
      .optional()
      .describe("Filter by field or programme name, e.g. 'Computer Science'."),
  }),
  callback: ({ country, level, field }) => {
    const kb = getKnowledgeBase(country);
    let list = kb.programmes;
    if (level) list = list.filter((p) => p.level === level);
    if (field) {
      const f = field.toLowerCase();
      list = list.filter(
        (p) => p.field.toLowerCase().includes(f) || p.name.toLowerCase().includes(f),
      );
    }
    // The catalogue runs to hundreds of records; cap what enters the context
    // and tell the model to refine instead of dumping everything.
    const MAX_RESULTS = 15;
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
