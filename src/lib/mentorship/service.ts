import { randomUUID } from "node:crypto";
import {
  countActiveForMentor,
  getMentorProfile,
  getProfile,
  listAvailableMentors,
  putMentorProfile,
  putMentorshipRequest,
  updateMentorshipRequest,
  type MentorProfile,
  type MentorshipRequest,
} from "@/lib/aws/repository";
import { pickMentor } from "./matching";
import { sendEmail } from "@/lib/aws/ses";
import { logInfo } from "@/lib/observability/logger";

/**
 * Mentorship service: request creation with automatic matching, and the
 * mentor-side transitions (accept / decline / complete).
 *
 * Flow: request created (status "open") -> best available mentor assigned
 * ("matched", notified by email when SES is configured) -> mentor accepts
 * ("accepted") or declines (back to "open", re-matched excluding the
 * decliner) -> session happens -> mentor marks it "completed" with a note.
 * The student follows everything on the Mentorship page.
 */

export interface CreateRequestInput {
  userId: string;
  studentEmail?: string;
  studentName?: string;
  topic: string;
  message: string;
}

export interface CreateRequestResult {
  requestId: string;
  matched: boolean;
  mentorName?: string;
}

export async function createMentorshipRequest(
  input: CreateRequestInput,
): Promise<CreateRequestResult> {
  const profile = await getProfile(input.userId);
  const request: MentorshipRequest = {
    userId: input.userId,
    requestId: randomUUID(),
    topic: input.topic,
    message: input.message,
    status: "open",
    createdAt: new Date().toISOString(),
    studentEmail: input.studentEmail ?? profile?.email,
    studentName: input.studentName ?? profile?.name,
    targetCountry: profile?.targetCountry,
    level: profile?.level,
    field: profile?.field,
  };
  await putMentorshipRequest(request);

  const matched = await matchAndAssign(request);
  logInfo("mentorship.request_created", { requestId: request.requestId, matched });
  return { requestId: request.requestId, matched, mentorName: request.mentorName };
}

/**
 * Assign the best available mentor to an open request. No mentor available
 * (none registered, or all at capacity) leaves the request "open" for the
 * next harvest-style sweep; the student sees "Open" on their page.
 */
export async function matchAndAssign(
  request: MentorshipRequest,
  excludeMentorIds: string[] = [],
): Promise<boolean> {
  const mentors = await listAvailableMentors();
  const withLoad = await Promise.all(
    mentors
      .filter((m) => !excludeMentorIds.includes(m.userId))
      .map(async (m) => ({ ...m, openCount: await countActiveForMentor(m.userId) })),
  );
  const best = pickMentor(withLoad, {
    targetCountry: request.targetCountry,
    level: request.level,
    field: request.field,
    language: request.language,
  });
  if (!best) return false;
  if (withLoad.find((m) => m.userId === best.userId)!.openCount >= best.capacityPerWeek) {
    return false;
  }

  request.status = "matched";
  request.mentorId = best.userId;
  request.mentorName = best.displayName;
  await updateMentorshipRequest(request);
  await notifyMentor(best, request);
  logInfo("mentorship.matched", { requestId: request.requestId, mentorId: best.userId });
  return true;
}

async function notifyMentor(mentor: MentorProfile, request: MentorshipRequest): Promise<void> {
  await sendEmail(
    mentor.email,
    `New mentorship request: ${request.topic}`,
    [
      `A student needs your help.`,
      ``,
      `Topic: ${request.topic}`,
      `Message: ${request.message}`,
      request.targetCountry ? `Target country: ${request.targetCountry}` : "",
      ``,
      `Open your mentor inbox on shetu.mol.la/mentor to accept or decline.`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

/** Mentor actions. Only the assigned mentor may perform them. */
export async function mentorRespond(
  request: MentorshipRequest,
  action: "accept" | "decline" | "complete",
  fields: { meetingUrl?: string; outcomeNote?: string },
): Promise<{ ok: boolean; status?: MentorshipRequest["status"]; reassigned?: boolean }> {
  const respondedAt = new Date().toISOString();
  if (action === "accept") {
    request.status = "accepted";
    request.respondedAt = respondedAt;
    if (fields.meetingUrl) request.meetingUrl = fields.meetingUrl;
    await updateMentorshipRequest(request);
    await sendEmail(
      request.studentEmail,
      `Your mentor accepted: ${request.topic}`,
      [
        `Good news: ${request.mentorName} accepted your mentorship request "${request.topic}".`,
        fields.meetingUrl ? `Meeting link: ${fields.meetingUrl}` : "",
        `You can also follow the status on shetu.mol.la/mentorship.`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return { ok: true, status: request.status };
  }
  if (action === "decline") {
    // Back into the pool: try another mentor, excluding the decliner.
    request.status = "open";
    const declinerId = request.mentorId;
    request.mentorId = undefined;
    request.mentorName = undefined;
    await updateMentorshipRequest(request);
    const reassigned = await matchAndAssign(request, declinerId ? [declinerId] : []);
    return { ok: true, status: request.status, reassigned };
  }
  // complete
  request.status = "completed";
  request.completedAt = respondedAt;
  if (fields.outcomeNote) request.outcomeNote = fields.outcomeNote;
  await updateMentorshipRequest(request);
  await sendEmail(
    request.studentEmail,
    `Session completed: ${request.topic}`,
    [
      `Your mentorship session for "${request.topic}" is marked completed.`,
      fields.outcomeNote ? `Mentor's note: ${fields.outcomeNote}` : "",
      `You can always ask Shetu for another session.`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return { ok: true, status: request.status };
}

/** Upsert the signed-in mentor's profile. */
export async function saveMentorProfile(
  userId: string,
  input: {
    displayName: string;
    email: string;
    bio: string;
    countries: string[];
    levels: string[];
    fields: string[];
    languages: string[];
    capacityPerWeek: number;
    available: boolean;
  },
): Promise<MentorProfile> {
  const existing = await getMentorProfile(userId);
  const profile: MentorProfile = {
    userId,
    ...input,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await putMentorProfile(profile);
  return profile;
}
