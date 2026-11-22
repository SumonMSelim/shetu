/**
 * GDPR export assembly (pure, unit-tested).
 *
 * Classifies the raw items from a user's partition into a portable bundle:
 * profile, conversations with their messages, mentorship requests, Vault
 * document metadata, usage counters, and audit traces. Internal key fields
 * (PK/SK) are stripped; everything else is the student's own data.
 */

export interface ExportBundle {
  exportedAt: string;
  userId: string;
  profile?: Record<string, unknown>;
  conversations: {
    conversationId: string;
    meta?: Record<string, unknown>;
    messages: Record<string, unknown>[];
  }[];
  mentorshipRequests: Record<string, unknown>[];
  vaultDocuments: Record<string, unknown>[];
  usageCounters: Record<string, unknown>[];
  traces: Record<string, unknown>[];
  other: Record<string, unknown>[];
}

const strip = (item: Record<string, unknown>): Record<string, unknown> => {
  const { PK: _pk, SK: _sk, ...rest } = item;
  return rest;
};

export function groupExportItems(
  userId: string,
  items: Record<string, unknown>[],
  exportedAt: string,
): ExportBundle {
  const bundle: ExportBundle = {
    exportedAt,
    userId,
    conversations: [],
    mentorshipRequests: [],
    vaultDocuments: [],
    usageCounters: [],
    traces: [],
    other: [],
  };
  const convIndex = new Map<string, ExportBundle["conversations"][number]>();

  for (const item of items) {
    const sk = String(item.SK ?? "");
    const clean = strip(item);
    if (sk === "PROFILE") {
      bundle.profile = clean;
      continue;
    }
    if (sk === "DELETED") {
      continue;
    }
    if (sk.startsWith("CONV#")) {
      const conversationId = sk.slice("CONV#".length);
      const existing = convIndex.get(conversationId) ?? { conversationId, messages: [] };
      existing.meta = clean;
      convIndex.set(conversationId, existing);
      continue;
    }
    if (sk.startsWith("CONVMSG#")) {
      // CONVMSG#<convId>#<seq>
      const conversationId = sk.slice("CONVMSG#".length).split("#")[0];
      const existing = convIndex.get(conversationId) ?? { conversationId, messages: [] };
      existing.messages.push(clean);
      convIndex.set(conversationId, existing);
      continue;
    }
    if (sk.startsWith("MENTORSHIP#")) {
      bundle.mentorshipRequests.push(clean);
      continue;
    }
    if (sk.startsWith("DOC#")) {
      bundle.vaultDocuments.push(clean);
      continue;
    }
    if (sk.startsWith("TRACE#")) {
      bundle.traces.push(clean);
      continue;
    }
    if (sk.startsWith("RATE#")) {
      bundle.usageCounters.push(clean);
      continue;
    }
    bundle.other.push(clean);
  }

  for (const conv of convIndex.values()) {
    conv.messages.sort((a, b) =>
      String(a.SK ?? "").localeCompare(String(b.SK ?? "")),
    );
    bundle.conversations.push(conv);
  }
  bundle.conversations.sort((a, b) => a.conversationId.localeCompare(b.conversationId));
  return bundle;
}
