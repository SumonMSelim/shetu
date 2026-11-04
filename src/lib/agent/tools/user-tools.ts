import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  listVaultDocs,
  getVaultDoc,
  putMentorshipRequest,
  getProfile,
  putProfile,
} from "@/lib/aws/repository";
import { readTextContent } from "@/lib/aws/vault";

/**
 * User-scoped tools.
 *
 * These are built per request with the authenticated `userId` bound in, so the
 * model can never act on another user's data: it only ever sees tools wired to
 * the current session's user. This is the security boundary for the Vault and
 * mentorship features.
 */
export function buildUserTools(userId: string) {
  const vaultList = tool({
    name: "vault_list",
    description:
      "List the documents the current student has stored in their Vault (statement of purpose, CV, transcripts, etc.). Use before offering to review a document.",
    inputSchema: z.object({}),
    callback: async () => {
      const docs = await listVaultDocs(userId);
      return {
        documents: docs.map((d) => ({
          docId: d.docId,
          fileName: d.fileName,
          docType: d.docType ?? "unknown",
          contentType: d.contentType,
          uploadedAt: d.uploadedAt,
        })),
      };
    },
  });

  const vaultRead = tool({
    name: "vault_read",
    description:
      "Read the text content of one of the student's stored documents by docId, so it can be reviewed. Works for text-based documents; if the document is a PDF or Word file, tell the student it cannot be read directly yet and ask them to paste the text.",
    inputSchema: z.object({
      docId: z.string().describe("The docId from vault_list."),
    }),
    callback: async ({ docId }) => {
      const doc = await getVaultDoc(userId, docId);
      if (!doc) return { error: "No such document in this student's Vault." };
      const isTextual =
        doc.contentType.startsWith("text/") ||
        doc.fileName.endsWith(".txt") ||
        doc.fileName.endsWith(".md");
      if (!isTextual) {
        return {
          error: `Document "${doc.fileName}" is ${doc.contentType}, which cannot be read as text yet. Ask the student to paste the content.`,
        };
      }
      const content = await readTextContent(doc.s3Key);
      return { fileName: doc.fileName, docType: doc.docType ?? "unknown", content };
    },
  });

  const requestMentorship = tool({
    name: "request_mentorship",
    description:
      "Record a request for a real human mentor on behalf of the student. Use when the student asks for a human, or when they face a high-stakes, emotional, or complex decision where a person would genuinely help. Confirm with the student before calling this.",
    inputSchema: z.object({
      topic: z
        .string()
        .describe("Short topic for the mentor, e.g. 'Choosing between two offers'."),
      message: z
        .string()
        .describe("A summary of what the student needs help with, in their words where possible."),
    }),
    callback: async ({ topic, message }) => {
      const requestId = randomUUID();
      await putMentorshipRequest({
        userId,
        requestId,
        topic,
        message,
        status: "open",
        createdAt: new Date().toISOString(),
      });
      return {
        ok: true,
        requestId,
        note: "A human mentorship request has been recorded. A mentor will follow up; the student can track it on the Mentorship page.",
      };
    },
  });

  const getStudentProfile = tool({
    name: "get_profile",
    description:
      "Get the current student's saved profile (target country, level, field, English score, budget, notes). Call this early to personalise advice instead of asking for details the student already gave.",
    inputSchema: z.object({}),
    callback: async () => {
      const profile = await getProfile(userId);
      if (!profile) return { profile: null, note: "No profile saved yet." };
      return { profile };
    },
  });

  const saveStudentProfile = tool({
    name: "save_profile",
    description:
      "Save or update facts about the student so future advice is personalised. Call this when the student shares durable background (target country, study level, field, English/IELTS score, yearly budget). Only include fields you actually learned; omit the rest.",
    inputSchema: z.object({
      name: z.string().max(120).optional(),
      targetCountry: z.string().max(60).optional().describe("ISO code or country name, e.g. 'NL'."),
      level: z.enum(["bachelor", "master", "phd"]).optional(),
      field: z.string().max(120).optional().describe("Intended field of study."),
      englishScore: z.string().max(60).optional().describe("e.g. 'IELTS 6.5'."),
      budgetPerYearEur: z.number().int().nonnegative().optional(),
      notes: z.string().max(1000).optional().describe("Other durable context worth remembering."),
    }),
    callback: async (input) => {
      const existing = await getProfile(userId);
      await putProfile({
        userId,
        name: input.name ?? existing?.name,
        targetCountry: input.targetCountry ?? existing?.targetCountry,
        level: input.level ?? existing?.level,
        field: input.field ?? existing?.field,
        englishScore: input.englishScore ?? existing?.englishScore,
        budgetPerYearEur: input.budgetPerYearEur ?? existing?.budgetPerYearEur,
        notes: input.notes ?? existing?.notes,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, note: "Profile saved." };
    },
  });

  return [vaultList, vaultRead, requestMentorship, getStudentProfile, saveStudentProfile];
}
