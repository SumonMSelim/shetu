import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb } from "./clients";
import { config } from "@/lib/config";
import type { TurnTrace } from "@/lib/observability/trace";

/**
 * Single-table DynamoDB repository.
 *
 * Key design (one table, `config.storage.tableName`):
 *   PK = USER#<userId>
 *   SK = PROFILE                       -> the student's profile (incl. role)
 *        DOC#<docId>                   -> a vault document's metadata
 *        MENTORSHIP#<requestId>        -> a mentorship request
 *        CONV#<convId>                 -> conversation metadata
 *        CONVMSG#<convId>#<seq>        -> one chat message
 *        TRACE#<convId>#<turn>         -> one audit record per chat turn
 *        RATE#<yyyy-mm-dd>             -> daily chat quota counter (has ttl)
 *
 * This keeps all of a user's data in one partition for cheap, consistent
 * reads, and needs no secondary indexes for the access patterns we have.
 */

const TABLE = config.storage.tableName;

export interface StudentProfile {
  userId: string;
  name?: string;
  email?: string;
  targetCountry?: string;
  level?: "bachelor" | "master" | "phd";
  field?: string;
  englishScore?: string;
  budgetPerYearEur?: number;
  notes?: string;
  /** Platform role; "student" by default. Assigned via scripts/set-role.ts. */
  role?: "student" | "mentor" | "admin";
  updatedAt: string;
}

export interface VaultDoc {
  userId: string;
  docId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  s3Key: string;
  docType?: string; // e.g. "sop", "cv", "transcript"
  uploadedAt: string;
}

export type MentorshipStatus =
  | "open"
  | "matched"
  | "accepted"
  | "declined"
  | "completed";

export interface MentorshipRequest {
  userId: string;
  requestId: string;
  topic: string;
  message: string;
  status: MentorshipStatus;
  createdAt: string;
  /** Student context, captured at creation for matching and mentor contact. */
  studentEmail?: string;
  studentName?: string;
  targetCountry?: string;
  level?: string;
  field?: string;
  language?: string;
  /** The mentor side, filled by matching and the mentor's responses. */
  mentorId?: string;
  mentorName?: string;
  respondedAt?: string;
  meetingUrl?: string;
  completedAt?: string;
  outcomeNote?: string;
}

export interface MentorProfile {
  userId: string;
  displayName: string;
  email: string;
  bio: string;
  /** ISO countries this mentor knows well, e.g. ["NL", "DE"]. */
  countries: string[];
  levels: string[];
  fields: string[];
  languages: string[];
  capacityPerWeek: number;
  available: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Profile -------------------------------------------------------------

export async function getProfile(userId: string): Promise<StudentProfile | null> {
  const res = await ddb().send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: "PROFILE" } }),
  );
  return (res.Item as StudentProfile | undefined) ?? null;
}

export async function putProfile(profile: StudentProfile): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${profile.userId}`, SK: "PROFILE", ...profile },
    }),
  );
}

// --- Vault documents -----------------------------------------------------

export async function putVaultDoc(doc: VaultDoc): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${doc.userId}`, SK: `DOC#${doc.docId}`, ...doc },
    }),
  );
}

export async function listVaultDocs(userId: string): Promise<VaultDoc[]> {
  const res = await ddb().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "DOC#" },
    }),
  );
  return (res.Items as VaultDoc[] | undefined) ?? [];
}

export async function getVaultDoc(userId: string, docId: string): Promise<VaultDoc | null> {
  const res = await ddb().send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${userId}`, SK: `DOC#${docId}` } }),
  );
  return (res.Item as VaultDoc | undefined) ?? null;
}

// --- Mentorship ----------------------------------------------------------

export async function putMentorshipRequest(req: MentorshipRequest): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${req.userId}`, SK: `MENTORSHIP#${req.requestId}`, ...req },
    }),
  );
}

export async function listMentorshipRequests(userId: string): Promise<MentorshipRequest[]> {
  const res = await ddb().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "MENTORSHIP#" },
    }),
  );
  return (res.Items as MentorshipRequest[] | undefined) ?? [];
}

/**
 * Requests assigned to one mentor, newest first. The requests live in the
 * STUDENT's partition, so this is a filtered scan: the mentor population is
 * small and request volume low, which keeps the single-table design free of
 * extra indexes. Revisit with a GSI if mentor traffic grows.
 */
export async function listRequestsForMentor(mentorId: string): Promise<MentorshipRequest[]> {
  const res = await ddb().send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "mentorId = :mid AND status IN (:matched, :accepted, :completed)",
      ExpressionAttributeValues: {
        ":mid": mentorId,
        ":matched": "matched",
        ":accepted": "accepted",
        ":completed": "completed",
      },
    }),
  );
  const items = (res.Items as MentorshipRequest[] | undefined) ?? [];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One request by id within the mentor's assignments (for action routes). */
export async function getRequestForMentor(
  mentorId: string,
  requestId: string,
): Promise<MentorshipRequest | null> {
  const res = await ddb().send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "mentorId = :mid AND requestId = :rid",
      ExpressionAttributeValues: { ":mid": mentorId, ":rid": requestId },
    }),
  );
  return (res.Items as MentorshipRequest[] | undefined)?.[0] ?? null;
}

/** Update an existing request in place (status flow fields). */
export async function updateMentorshipRequest(
  request: MentorshipRequest,
): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${request.userId}`, SK: `MENTORSHIP#${request.requestId}`, ...request },
    }),
  );
}

// --- Mentor profiles -------------------------------------------------------

export async function putMentorProfile(profile: MentorProfile): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${profile.userId}`,
        SK: "MENTOR_PROFILE",
        ...profile,
      },
    }),
  );
}

export async function getMentorProfile(userId: string): Promise<MentorProfile | null> {
  const res = await ddb().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: "MENTOR_PROFILE" },
    }),
  );
  return (res.Item as MentorProfile | undefined) ?? null;
}

/**
 * All mentor profiles that are accepting mentees. A filtered scan on purpose:
 * mentors are counted in tens, so a scan is simpler than a GSI while the
 * single-table design stays index-free. Revisit if the mentor base grows.
 */
export async function listAvailableMentors(): Promise<MentorProfile[]> {
  const res = await ddb().send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "SK = :sk AND available = :yes",
      ExpressionAttributeValues: { ":sk": "MENTOR_PROFILE", ":yes": true },
    }),
  );
  return (res.Items as MentorProfile[] | undefined) ?? [];
}

/** Open (matched/accepted) request count for a mentor, for capacity checks. */
export async function countActiveForMentor(mentorId: string): Promise<number> {
  const res = await ddb().send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression:
        "mentorId = :mid AND (status = :matched OR status = :accepted)",
      ExpressionAttributeValues: {
        ":mid": mentorId,
        ":matched": "matched",
        ":accepted": "accepted",
      },
      Select: "COUNT",
    }),
  );
  return res.Count ?? 0;
}

// --- Conversations & messages -------------------------------------------
//
// Keys:
//   PK = USER#<id>
//   SK = CONV#<convId>              -> conversation metadata (title, times)
//        CONVMSG#<convId>#<seq>     -> one message, seq is a zero-padded index
//
// Listing a user's conversations queries SK begins_with "CONV#" (which also
// matches CONVMSG#, so we filter by the exact prefix shape). To keep it simple
// and correct, metadata uses "CONV#" and messages use "CONVMSG#", two distinct
// prefixes, so neither query accidentally includes the other.

export interface Conversation {
  userId: string;
  convId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  userId: string;
  convId: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

function pad(n: number): string {
  return String(n).padStart(6, "0");
}

export async function putConversation(c: Conversation): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${c.userId}`, SK: `CONV#${c.convId}`, ...c },
    }),
  );
}

export async function touchConversation(
  userId: string,
  convId: string,
  updatedAt: string,
  title?: string,
): Promise<void> {
  const names: Record<string, string> = { "#u": "updatedAt" };
  const values: Record<string, unknown> = { ":u": updatedAt };
  let expr = "SET #u = :u";
  if (title) {
    names["#t"] = "title";
    values[":t"] = title;
    expr += ", #t = :t";
  }
  await ddb().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: `CONV#${convId}` },
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const res = await ddb().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": "CONV#" },
    }),
  );
  const items = (res.Items as Conversation[] | undefined) ?? [];
  // Newest first.
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function appendMessage(msg: ChatMessageRecord): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${msg.userId}`,
        SK: `CONVMSG#${msg.convId}#${pad(msg.seq)}`,
        ...msg,
      },
    }),
  );
}

export async function listMessages(
  userId: string,
  convId: string,
): Promise<ChatMessageRecord[]> {
  const res = await ddb().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":sk": `CONVMSG#${convId}#`,
      },
    }),
  );
  const items = (res.Items as ChatMessageRecord[] | undefined) ?? [];
  return items.sort((a, b) => a.seq - b.seq);
}

export async function countMessages(userId: string, convId: string): Promise<number> {
  const msgs = await listMessages(userId, convId);
  return msgs.length;
}

/**
 * Delete one conversation and all its messages (per-chat self-service
 * deletion, complementing the whole-partition GDPR erasure). Turn traces
 * are intentionally kept: they are the audit trail. Returns the number of
 * items removed (0 when the conversation does not exist).
 */
export async function deleteConversation(userId: string, convId: string): Promise<number> {
  const keys: { PK: string; SK: string }[] = [];
  for (const prefix of [`CONV#${convId}`, `CONVMSG#${convId}#`]) {
    let lastEvaluated: Record<string, unknown> | undefined;
    do {
      const res = await ddb().send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":sk": prefix },
          ProjectionExpression: "PK, SK",
          ExclusiveStartKey: lastEvaluated,
        }),
      );
      for (const item of (res.Items as { PK: string; SK: string }[] | undefined) ?? []) {
        keys.push({ PK: item.PK, SK: item.SK });
      }
      lastEvaluated = res.LastEvaluatedKey;
    } while (lastEvaluated);
  }
  for (let i = 0; i < keys.length; i += 25) {
    const batch = keys.slice(i, i + 25).map((k) => ({ DeleteRequest: { Key: k } }));
    await ddb().send(new BatchWriteCommand({ RequestItems: { [TABLE]: batch } }));
  }
  return keys.length;
}

// --- Turn traces (observability/audit) -------------------------------------
//
// Written once when a chat turn completes. Records what the agents did
// (model calls with token usage, tool calls, specialists, outcome) without
// duplicating message content: messages stay in their CONVMSG items and the
// trace references them by conversation id and turn number. Append-only,
// never updated; consumed by cost dashboards, citation auditing, and the
// offline evaluation suite.

export async function putTurnTrace(trace: TurnTrace): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${trace.userId}`,
        SK: `TRACE#${trace.convId}#${String(trace.turn).padStart(6, "0")}`,
        ...trace,
      },
    }),
  );
}

// --- Admin triage -----------------------------------------------------------

/** Every mentorship request, newest first. Admin triage only (filtered scan:
 *  the mentorship population is small; a GSI arrives with volume). */
export async function listAllMentorshipRequests(): Promise<MentorshipRequest[]> {
  const res = await ddb().send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":sk": "MENTORSHIP#" },
    }),
  );
  const items = (res.Items as MentorshipRequest[] | undefined) ?? [];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Every mentor profile, including paused/unavailable ones (admin view). */
export async function listAllMentorProfiles(): Promise<MentorProfile[]> {
  const res = await ddb().send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "MENTOR_PROFILE" },
    }),
  );
  return (res.Items as MentorProfile[] | undefined) ?? [];
}

/** Admin-direct assignment to a specific mentor (bypasses matching scores). */
export async function assignMentorToRequest(
  userId: string,
  requestId: string,
  mentor: { userId: string; displayName: string },
): Promise<MentorshipRequest | null> {
  const res = await ddb().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: `MENTORSHIP#${requestId}` },
    }),
  );
  const request = res.Item as MentorshipRequest | undefined;
  if (!request) return null;
  request.status = "matched";
  request.mentorId = mentor.userId;
  request.mentorName = mentor.displayName;
  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `USER#${request.userId}`, SK: `MENTORSHIP#${request.requestId}`, ...request },
    }),
  );
  return request;
}

// --- GDPR export and erasure ------------------------------------------------

/** Every item in the user's partition, in raw DynamoDB form (GDPR export). */
export async function listEverythingForUser(userId: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastEvaluated: Record<string, unknown> | undefined;
  do {
    const res = await ddb().send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        ExclusiveStartKey: lastEvaluated,
      }),
    );
    items.push(...((res.Items as Record<string, unknown>[]) ?? []));
    lastEvaluated = res.LastEvaluatedKey;
  } while (lastEvaluated);
  return items;
}

/**
 * Erase the user's partition (GDPR Art. 17). Deletes in batches of 25 until
 * the partition is empty, then writes a minimal tombstone so the identifier
 * cannot be silently re-used with old data. Returns the deleted item count.
 */
export async function deleteEverythingForUser(userId: string): Promise<number> {
  let deleted = 0;
  let lastEvaluated: Record<string, unknown> | undefined;
  do {
    const res = await ddb().send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        ExclusiveStartKey: lastEvaluated,
      }),
    );
    const page = (res.Items as Record<string, unknown>[]) ?? [];
    for (let i = 0; i < page.length; i += 25) {
      const batch = page.slice(i, i + 25).map((item) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      }));
      await ddb().send(
        new BatchWriteCommand({ RequestItems: { [TABLE]: batch } }),
      );
      deleted += batch.length;
    }
    lastEvaluated = res.LastEvaluatedKey;
  } while (lastEvaluated);

  await ddb().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `USER#${userId}`,
        SK: "DELETED",
        deletedAt: new Date().toISOString(),
        reason: "gdpr-erasure-request",
      },
    }),
  );
  return deleted;
}
