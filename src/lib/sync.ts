import { sql } from "./db";
import { USER_ID } from "./constants";
import { fetchNewMessages } from "./gmail";
import { classifyMessages, extractJobData, Classification, ExtractResult } from "./anthropic";
import { sendDigest } from "./digest";

// Senders whose emails are never job-application-related (job board marketing, alerts)
const BLOCKED_SENDER_PATTERNS = [
  "indeed.com",
  "glassdoor.com",
];

function isBlockedSender(fromAddress: string): boolean {
  const lower = fromAddress.toLowerCase();
  return BLOCKED_SENDER_PATTERNS.some((pattern) => lower.includes(pattern));
}

const JOB_CLASSIFICATIONS = new Set<Classification>([
  "application_confirmation",
  "rejection",
  "interview_invite",
  "offer",
  "recruiter_outreach",
]);

const STATUS_FOR: Partial<Record<Classification, string>> = {
  recruiter_outreach: "screening",
  interview_invite: "interviewing",
  offer: "offer",
  rejection: "rejected",
};

export interface SyncResult {
  emailsProcessed: number;
  errors: string[];
}

export async function runSync(): Promise<SyncResult> {
  const errors: string[] = [];
  let emailsProcessed = 0;

  // Record sync start
  const [{ id: syncRunId }] = await sql`
    insert into sync_runs (user_id, status) values (${USER_ID}::uuid, 'running') returning id
  `;

  try {
    // 1. Last successful sync time
    const [lastSync] = await sql`
      select started_at from sync_runs
      where user_id = ${USER_ID}::uuid and status = 'success'
      order by started_at desc limit 1
    `;
    const since: Date | null = lastSync ? new Date(lastSync.started_at as string) : null;

    // 2. Fetch inbox messages since last sync
    const rawMessages = await fetchNewMessages(since);
    if (rawMessages.length === 0) {
      await markDone(syncRunId, 0, []);
      return { emailsProcessed: 0, errors: [] };
    }

    // 3. Idempotency — skip already-seen gmail_message_ids
    const msgIds = rawMessages.map((m) => m.id);
    const seen = await sql`
      select gmail_message_id from emails where gmail_message_id = any(${msgIds})
    `;
    const seenSet = new Set(seen.map((r) => r.gmail_message_id as string));
    const unseenMessages = rawMessages.filter((m) => !seenSet.has(m.id));
    const newMessages = unseenMessages.filter((m) => !isBlockedSender(m.fromAddress));

    if (newMessages.length === 0) {
      await markDone(syncRunId, 0, []);
      return { emailsProcessed: 0, errors: [] };
    }

    // 4. Pass 1 — classify (single batched call)
    const classifications = await classifyMessages(
      newMessages.map((m) => ({
        id: m.id,
        subject: m.subject,
        snippet: m.snippet,
        fromAddress: m.fromAddress,
      }))
    );
    const classMap = new Map(classifications.map((c) => [c.messageId, c.classification]));

    const jobMessages = newMessages.filter((m) => JOB_CLASSIFICATIONS.has(classMap.get(m.id)!));
    // Cap per run so the route doesn't timeout — remainder picked up next sync
    const EXTRACT_CAP = 50;
    const toExtract = jobMessages.slice(0, EXTRACT_CAP);

    // 5. Pass 2 — extract + upsert per job-related message
    for (const msg of toExtract) {
      try {
        const extracted = await extractJobData({
          subject: msg.subject,
          fromAddress: msg.fromAddress,
          body: msg.body,
          snippet: msg.snippet,
        });

        if (!extracted) {
          errors.push(`${msg.id}: extract returned null`);
          continue;
        }
        // 6. Match or create application
        const { applicationId, ambiguous } = await matchOrCreateApplication(msg.threadId, extracted);

        const needsReview = extracted.confidence < 0.7 || ambiguous;

        // 7. Upsert email row
        await sql`
          insert into emails (
            user_id, application_id, gmail_message_id, thread_id,
            from_address, subject, received_at, snippet,
            extracted, classification, confidence, needs_review
          ) values (
            ${USER_ID}::uuid,
            ${applicationId}::uuid,
            ${msg.id},
            ${msg.threadId},
            ${msg.fromAddress},
            ${msg.subject},
            ${msg.receivedAt.toISOString()}::timestamptz,
            ${msg.snippet},
            ${JSON.stringify(extracted)}::jsonb,
            ${extracted.classification},
            ${extracted.confidence},
            ${needsReview}
          )
          on conflict (gmail_message_id) do nothing
        `;

        // 8. Update parent application
        await updateApplication(applicationId, extracted, msg.receivedAt);

        emailsProcessed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[sync] error on message", msg.id, ":", errMsg);
        errors.push(`${msg.id}: ${errMsg}`);
      }
    }

    // Ghost check — applied/screening with no contact in 21+ days
    await sql`
      update applications set status = 'ghosted', updated_at = now()
      where user_id = ${USER_ID}::uuid
        and status in ('applied', 'screening')
        and last_contact_at < now() - interval '21 days'
    `;

    await markDone(syncRunId, emailsProcessed, errors);
    await sendDigest(emailsProcessed).catch((err) =>
      console.error("[sync] digest failed:", err instanceof Error ? err.message : err)
    );
    return { emailsProcessed, errors };
  } catch (err) {
    console.error("[sync] fatal error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    await sql`
      update sync_runs
      set status = 'failed', finished_at = now(), errors = ${JSON.stringify([msg])}::jsonb
      where id = ${syncRunId}::uuid
    `;
    throw err;
  }
}

async function matchOrCreateApplication(
  threadId: string,
  extracted: ExtractResult
): Promise<{ applicationId: string; ambiguous: boolean }> {
  // 1. Thread match — most reliable
  const [threadMatch] = await sql`
    select a.id from applications a
    join emails e on e.application_id = a.id
    where e.thread_id = ${threadId} and a.user_id = ${USER_ID}::uuid
    limit 1
  `;
  if (threadMatch) return { applicationId: threadMatch.id as string, ambiguous: false };

  // 2. Fuzzy company name match via pg_trgm
  const fuzzyMatches = await sql`
    select id, similarity(lower(company), lower(${extracted.company})) as sim
    from applications
    where user_id = ${USER_ID}::uuid
      and status not in ('rejected', 'withdrawn')
      and similarity(lower(company), lower(${extracted.company})) > 0.6
    order by sim desc
    limit 2
  `;
  if (fuzzyMatches.length === 1) {
    return { applicationId: fuzzyMatches[0].id as string, ambiguous: false };
  }
  if (fuzzyMatches.length > 1) {
    // Multiple plausible matches — take best but flag for review
    return { applicationId: fuzzyMatches[0].id as string, ambiguous: true };
  }

  // 3. No match — create new application
  const [newApp] = await sql`
    insert into applications (user_id, company, role, location, status)
    values (${USER_ID}::uuid, ${extracted.company}, ${extracted.role}, ${extracted.location}, 'applied')
    returning id
  `;
  return { applicationId: newApp.id as string, ambiguous: false };
}

async function updateApplication(
  applicationId: string,
  extracted: ExtractResult,
  receivedAt: Date
): Promise<void> {
  const ts = receivedAt.toISOString();
  const newStatus = STATUS_FOR[extracted.classification];

  if (newStatus) {
    await sql`
      update applications set
        status = ${newStatus},
        last_contact_at = ${ts}::timestamptz,
        email_count = email_count + 1,
        updated_at = now()
      where id = ${applicationId}::uuid
    `;
  } else if (extracted.classification === "application_confirmation") {
    await sql`
      update applications set
        applied_at = coalesce(applied_at, ${ts}::timestamptz),
        last_contact_at = ${ts}::timestamptz,
        email_count = email_count + 1,
        updated_at = now()
      where id = ${applicationId}::uuid
    `;
  } else {
    // "other" — keep status, still track contact time
    await sql`
      update applications set
        last_contact_at = ${ts}::timestamptz,
        email_count = email_count + 1,
        updated_at = now()
      where id = ${applicationId}::uuid
    `;
  }
}

async function markDone(syncRunId: string, count: number, errors: string[]) {
  await sql`
    update sync_runs set
      status = 'success',
      finished_at = now(),
      emails_processed = ${count},
      errors = ${errors.length > 0 ? JSON.stringify(errors) : null}::jsonb
    where id = ${syncRunId}::uuid
  `;
}
