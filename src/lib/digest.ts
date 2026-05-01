import { Resend } from "resend";
import { sql } from "./db";
import { USER_ID } from "./constants";

export async function sendDigest(emailsProcessed: number) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO_EMAIL;
  if (!apiKey || !to) return;

  const resend = new Resend(apiKey);

  const [newApps, pipeline, reviewCount] = await Promise.all([
    sql`
      select count(*)::int as count from applications
      where user_id = ${USER_ID}::uuid
        and created_at >= now() - interval '25 hours'
    `,
    sql`
      select status, count(*)::int as count from applications
      where user_id = ${USER_ID}::uuid
      group by status
    `,
    sql`
      select count(*)::int as count from emails
      where user_id = ${USER_ID}::uuid and needs_review = true
    `,
  ]);

  const newCount = (newApps[0] as { count: number }).count;
  const reviewNeeded = (reviewCount[0] as { count: number }).count;
  const byStatus = Object.fromEntries(
    (pipeline as { status: string; count: number }[]).map((r) => [r.status, r.count])
  );

  const lines = [
    newCount > 0
      ? `${newCount} new application${newCount === 1 ? "" : "s"} added yesterday.`
      : "No new applications yesterday.",
    ``,
    `Pipeline:`,
    `  Applied:      ${byStatus.applied ?? 0}`,
    `  Screening:    ${byStatus.screening ?? 0}`,
    `  Interviewing: ${byStatus.interviewing ?? 0}`,
    `  Offer:        ${byStatus.offer ?? 0}`,
    `  Rejected:     ${byStatus.rejected ?? 0}`,
    `  Ghosted:      ${byStatus.ghosted ?? 0}`,
  ];

  if (reviewNeeded > 0) {
    lines.push(``, `⚠ ${reviewNeeded} email${reviewNeeded === 1 ? "" : "s"} need review on your dashboard.`);
  }

  if (emailsProcessed > 0) {
    lines.push(``, `${emailsProcessed} email${emailsProcessed === 1 ? "" : "s"} processed in this sync.`);
  }

  await resend.emails.send({
    from: "Job Tracker <onboarding@resend.dev>",
    to,
    subject: `Job Tracker: ${newCount > 0 ? `${newCount} new application${newCount === 1 ? "" : "s"}` : "Daily digest"}`,
    text: lines.join("\n"),
  });
}
