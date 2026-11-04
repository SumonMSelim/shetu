import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { getKnowledgeBase, availableCountries, DEFAULT_COUNTRY } from "@/lib/knowledge";

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
    return { country: kb.country, scholarships: kb.scholarships };
  },
});

export const getCosts = tool({
  name: "get_costs",
  description:
    "Get the verified, itemised cost of studying in a destination: tuition (statutory vs institutional), living costs, insurance, visa fees, and required proof of funds. Use for any budget, cost, or affordability question.",
  inputSchema: z.object({ country: countryField }),
  callback: ({ country }) => {
    const kb = getKnowledgeBase(country);
    return { country: kb.country, currency: kb.currency, costs: kb.costs };
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

/** All knowledge tools, for convenient registration. */
export const knowledgeTools = [
  listDestinations,
  getScholarships,
  getCosts,
  getApplicationInfo,
  getVisaInfo,
  getInstitutions,
  getRedFlags,
];
