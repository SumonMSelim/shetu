import { Agent } from "@strands-agents/sdk";
import { primaryModel, fastModel } from "./model";
import { knowledgeTools } from "./tools/knowledge-tools";
import { buildUserTools } from "./tools/user-tools";
import {
  ORCHESTRATOR_PROMPT,
  READINESS_PROMPT,
  MATCHER_PROMPT,
  COST_SCAM_PROMPT,
  DOCUMENT_COACH_PROMPT,
  IELTS_PROMPT,
} from "./prompts";
import type { Message } from "@strands-agents/sdk";

/**
 * Assembles Shetu's multi-agent system for a single authenticated user.
 *
 * Architecture (agents-as-tools):
 *
 *   Orchestrator (talks to the student)
 *     ├─ readiness_specialist     ─┐
 *     ├─ opportunity_matcher       │ specialist sub-agents,
 *     ├─ cost_scam_guard           │ each with its own prompt
 *     ├─ document_coach            │ and the knowledge tools
 *     ├─ ielts_prep               ─┘
 *     ├─ knowledge tools (direct factual lookups)
 *     └─ user tools (vault_list, vault_read, request_mentorship)
 *
 * Specialists set `printer: false` so only the orchestrator's output streams to
 * the client. Each is wrapped with `.asTool()` giving the model a clear name and
 * description to route on.
 */
export function buildOrchestrator(userId: string, history?: Message[]): Agent {
  // Specialist sub-agents. Most share the primary model; IELTS drilling can use
  // the cheaper fast model since it is lighter work.
  const readiness = new Agent({
    name: "readiness_specialist",
    model: primaryModel(),
    systemPrompt: READINESS_PROMPT,
    tools: [...knowledgeTools],
    printer: false,
  });

  const matcher = new Agent({
    name: "opportunity_matcher",
    model: primaryModel(),
    systemPrompt: MATCHER_PROMPT,
    tools: [...knowledgeTools],
    printer: false,
  });

  const costScamGuard = new Agent({
    name: "cost_scam_guard",
    model: primaryModel(),
    systemPrompt: COST_SCAM_PROMPT,
    tools: [...knowledgeTools],
    printer: false,
  });

  const documentCoach = new Agent({
    name: "document_coach",
    model: primaryModel(),
    systemPrompt: DOCUMENT_COACH_PROMPT,
    tools: [...buildUserTools(userId)],
    printer: false,
  });

  const ieltsPrep = new Agent({
    name: "ielts_prep",
    model: fastModel(),
    systemPrompt: IELTS_PROMPT,
    tools: [],
    printer: false,
  });

  // The orchestrator: specialists as tools + direct knowledge and user tools.
  const orchestrator = new Agent({
    name: "shetu",
    model: primaryModel(),
    systemPrompt: ORCHESTRATOR_PROMPT,
    messages: history,
    printer: false,
    tools: [
      readiness.asTool({
        name: "readiness_specialist",
        description:
          "Honest assessment of the student's profile, realistic options, and gaps to close.",
      }),
      matcher.asTool({
        name: "opportunity_matcher",
        description:
          "Match the student's profile to realistic programmes and funding, with honest fit reasoning.",
      }),
      costScamGuard.asTool({
        name: "cost_scam_guard",
        description:
          "Itemised real costs for studying abroad AND checking agencies/offers against known predatory red flags.",
      }),
      documentCoach.asTool({
        name: "document_coach",
        description:
          "Review and improve the student's SOP, CV, or motivation letter, reading from their Vault when available.",
      }),
      ieltsPrep.asTool({
        name: "ielts_prep",
        description:
          "IELTS preparation: explain bands, generate practice, and score sample answers with realistic feedback.",
      }),
      ...knowledgeTools,
      ...buildUserTools(userId),
    ],
  });

  return orchestrator;
}
