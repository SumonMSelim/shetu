import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { logWarn } from "@/lib/observability/logger";

/**
 * Transactional email via SESv2. Fire-and-forget: notifications are an
 * enhancement to the in-app mentorship flow, never a hard dependency. Emails
 * are plain text, content-only (no chat transcripts to third parties).
 *
 * Requires SHETU_SES_FROM (a verified SES identity). While the SES account is
 * in the sandbox, recipients must also be verified identities; request
 * production access before public launch.
 */

const ses = new SESv2Client({ region: process.env.AWS_REGION ?? "us-east-1" });

export async function sendEmail(
  to: string | undefined,
  subject: string,
  text: string,
): Promise<{ sent: boolean; detail?: string }> {
  const from = process.env.SHETU_SES_FROM;
  if (!from) return { sent: false, detail: "SHETU_SES_FROM not configured" };
  if (!to) return { sent: false, detail: "no recipient address" };
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" } },
          },
        },
      }),
    );
    return { sent: true };
  } catch (err) {
    logWarn("ses.send_failed", err, { subject });
    return { sent: false, detail: String(err).slice(0, 160) };
  }
}
