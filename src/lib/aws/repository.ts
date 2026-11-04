import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb } from "./clients";
import { config } from "@/lib/config";

/**
 * Single-table DynamoDB repository.
 *
 * Key design (one table, `config.storage.tableName`):
 *   PK = USER#<userId>
 *   SK = PROFILE                       -> the student's profile
 *        DOC#<docId>                   -> a vault document's metadata
 *        MENTORSHIP#<requestId>        -> a mentorship request
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

export interface MentorshipRequest {
  userId: string;
  requestId: string;
  topic: string;
  message: string;
  status: "open" | "assigned" | "closed";
  createdAt: string;
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

export async function updateMentorshipStatus(
  userId: string,
  requestId: string,
  status: MentorshipRequest["status"],
): Promise<void> {
  await ddb().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `USER#${userId}`, SK: `MENTORSHIP#${requestId}` },
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": status },
    }),
  );
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
