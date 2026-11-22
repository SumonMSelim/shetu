import {
  assignMentorToRequest,
  countActiveForMentor,
  getMentorProfile,
  listAllMentorProfiles,
  listAllMentorshipRequests,
  type MentorProfile,
  type MentorshipRequest,
} from "@/lib/aws/repository";
import { sendEmail } from "@/lib/aws/ses";

/**
 * Admin triage (pure grouping + the admin assignment action).
 *
 * Groups every mentorship request into the three buckets the admin console
 * shows, computes per-mentor load, and lets an admin assign an open request
 * to a specific mentor (bypassing the automatic match, with notification).
 */

export interface TriageView {
  open: MentorshipRequest[];
  active: MentorshipRequest[];
  completed: MentorshipRequest[];
  mentors: (MentorProfile & { activeCount: number })[];
}

export function groupRequests(requests: MentorshipRequest[]): {
  open: MentorshipRequest[];
  active: MentorshipRequest[];
  completed: MentorshipRequest[];
} {
  const open = requests.filter((r) => r.status === "open" || r.status === "declined");
  const active = requests.filter((r) => r.status === "matched" || r.status === "accepted");
  const completed = requests.filter((r) => r.status === "completed");
  return { open, active, completed };
}

export async function loadTriage(): Promise<TriageView> {
  const [requests, mentors] = await Promise.all([
    listAllMentorshipRequests(),
    listAllMentorProfiles(),
  ]);
  const activeCounts = await Promise.all(
    mentors.map(async (m) => ({ userId: m.userId, count: await countActiveForMentor(m.userId) })),
  );
  const countFor = (userId: string) =>
    activeCounts.find((c) => c.userId === userId)?.count ?? 0;
  return {
    ...groupRequests(requests),
    mentors: mentors.map((m) => ({ ...m, activeCount: countFor(m.userId) })),
  };
}

/**
 * Admin assigns an open request to a mentor (or "auto" to run the normal
 * matching). Notifies the mentor by email when SES is configured.
 */
export async function adminAssign(
  request: MentorshipRequest,
  mentorId: string | "auto",
): Promise<{ ok: boolean; mentorName?: string; reassigned?: boolean }> {
  if (mentorId === "auto") {
    const { matchAndAssign } = await import("./service");
    const assigned = await matchAndAssign(request);
    return { ok: assigned, mentorName: request.mentorName, reassigned: assigned };
  }
  const mentor = await getMentorProfile(mentorId);
  if (!mentor) return { ok: false };
  const updated = await assignMentorToRequest(request.userId, request.requestId, {
    userId: mentor.userId,
    displayName: mentor.displayName,
  });
  if (!updated) return { ok: false };
  await sendEmail(
    mentor.email,
    `Assigned to you: ${updated.topic}`,
    [
      `An admin assigned a mentorship request to you.`,
      ``,
      `Topic: ${updated.topic}`,
      `Message: ${updated.message}`,
      updated.targetCountry ? `Target country: ${updated.targetCountry}` : "",
      ``,
      `Open your mentor inbox on shetu.mol.la/mentor to accept or decline.`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return { ok: true, mentorName: mentor.displayName };
}
