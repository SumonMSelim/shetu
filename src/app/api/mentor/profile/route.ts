import { auth } from "@/auth";
import { z } from "zod";
import { hasRole } from "@/lib/auth/roles";
import { getMentorProfile } from "@/lib/aws/repository";
import { saveMentorProfile } from "@/lib/mentorship/service";

/**
 * Mentor profile API (role: mentor).
 *   GET  -> the signed-in mentor's profile
 *   PUT  -> upsert the profile
 */
export const runtime = "nodejs";

const ProfileSchema = z.object({
  displayName: z.string().min(1).max(120),
  email: z.string().email().max(200),
  bio: z.string().min(20).max(2000),
  countries: z.array(z.string().length(2)).max(12),
  levels: z.array(z.enum(["bachelor", "master", "phd"])).max(3),
  fields: z.array(z.string().min(2).max(80)).max(12),
  languages: z.array(z.string().min(2).max(40)).max(6),
  capacityPerWeek: z.number().int().min(0).max(50),
  available: z.boolean(),
});

async function userIdOrNull(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await hasRole(userId, "mentor", "admin"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const profile = await getMentorProfile(userId);
  return Response.json({ profile });
}

export async function PUT(req: Request): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!(await hasRole(userId, "mentor", "admin"))) {
    return new Response("Forbidden", { status: 403 });
  }
  let parsed: z.infer<typeof ProfileSchema>;
  try {
    parsed = ProfileSchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const profile = await saveMentorProfile(userId, parsed);
  return Response.json({ ok: true, profile });
}
