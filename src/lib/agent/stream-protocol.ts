/**
 * The newline-delimited JSON event protocol between the chat API and the UI.
 *
 * Each line sent by /api/chat is one JSON object of this shape. Keeping it
 * explicit (rather than leaking raw SDK events to the browser) means the UI
 * depends on a small, stable contract and no server-only types cross the wire.
 */
export type ChatStreamEvent =
  /** A chunk of assistant text to append. */
  | { kind: "text"; text: string }
  /** A specialist or tool started working - drives the "thinking" indicator. */
  | { kind: "tool"; name: string; label: string }
  /** The turn finished successfully. */
  | { kind: "done" }
  /** Something failed; `message` is safe to show the user. */
  | { kind: "error"; message: string };

/** Friendly labels for tool/specialist names shown in the UI. */
export const TOOL_LABELS: Record<string, string> = {
  readiness_specialist: "Assessing your readiness",
  opportunity_matcher: "Matching programmes and funding",
  cost_scam_guard: "Checking real costs and red flags",
  document_coach: "Reviewing your documents",
  ielts_prep: "Preparing IELTS guidance",
  get_scholarships: "Looking up scholarships",
  get_costs: "Looking up real costs",
  get_application_info: "Checking application requirements",
  get_visa_info: "Checking visa requirements",
  get_institutions: "Comparing institutions",
  get_red_flags: "Checking for agency red flags",
  list_destinations: "Listing destinations",
  vault_list: "Opening your Vault",
  vault_read: "Reading your document",
  request_mentorship: "Arranging human mentorship",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Working (${name})`;
}

export function encodeEvent(event: ChatStreamEvent): string {
  return JSON.stringify(event) + "\n";
}
