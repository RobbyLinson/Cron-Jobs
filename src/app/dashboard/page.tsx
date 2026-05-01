import { sql } from "@/lib/db";
import { USER_ID } from "@/lib/constants";
import { SyncButton } from "./components/SyncButton";
import { ReviewQueue } from "./components/ReviewQueue";
import { ApplicationsTable } from "./components/ApplicationsTable";


async function fetchAll() {
  const [apps, reviewRows, syncRow, statusCounts, responseRow, medianRow] = await Promise.all([
    sql`
      select id, company, role, location, source, status, applied_at, last_contact_at, email_count, notes
      from applications
      where user_id = ${USER_ID}::uuid
      order by updated_at desc
    `,
    sql`
      select e.id as email_id, e.application_id, e.subject, e.classification,
             e.confidence, e.from_address, e.received_at,
             a.company, a.role, a.status
      from emails e
      join applications a on a.id = e.application_id
      where e.user_id = ${USER_ID}::uuid and e.needs_review = true
      order by e.received_at desc
    `,
    sql`
      select started_at, emails_processed
      from sync_runs
      where user_id = ${USER_ID}::uuid and status = 'success'
      order by started_at desc limit 1
    `,
    sql`
      select status, count(*)::int as count
      from applications where user_id = ${USER_ID}::uuid
      group by status
    `,
    sql`
      select count(distinct application_id)::int as responded
      from emails
      where user_id = ${USER_ID}::uuid
        and classification in ('rejection', 'interview_invite', 'offer', 'recruiter_outreach')
    `,
    sql`
      select round(
        percentile_cont(0.5) within group (
          order by extract(epoch from (first_response - applied_at)) / 86400
        )::numeric, 1
      ) as median_days
      from (
        select a.applied_at, min(e.received_at) as first_response
        from applications a
        join emails e on e.application_id = a.id
        where a.user_id = ${USER_ID}::uuid
          and e.classification in ('rejection', 'interview_invite', 'offer', 'recruiter_outreach')
          and a.applied_at is not null
        group by a.id, a.applied_at
      ) t
    `,
  ]);

  return { apps, reviewRows, syncRow, statusCounts, responseRow, medianRow };
}


function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function DashboardPage() {
  const { apps, reviewRows, syncRow, statusCounts, responseRow, medianRow } = await fetchAll();

  const total = apps.length;
  const byStatus = Object.fromEntries(
    (statusCounts as { status: string; count: number }[]).map((r) => [r.status, r.count])
  );
  const responded = (responseRow[0] as { responded: number })?.responded ?? 0;
  const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
  const ghostRate = total > 0 ? Math.round(((byStatus.ghosted ?? 0) / total) * 100) : 0;
  const medianDays = (medianRow[0] as { median_days: number | null })?.median_days ?? null;
  const lastSync = syncRow[0] as { started_at: string; emails_processed: number } | undefined;

  const reviewItems = (reviewRows as {
    email_id: string;
    application_id: string;
    subject: string;
    classification: string;
    confidence: number;
    from_address: string;
    received_at: string;
    company: string;
    role: string | null;
    status: string;
  }[]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Job Tracker</h1>
          <div className="flex items-center gap-4 text-sm text-gray-700">
            {lastSync ? (
              <span>Last sync {timeAgo(lastSync.started_at)} · {lastSync.emails_processed} emails</span>
            ) : (
              <span>Never synced</span>
            )}
            <SyncButton />
            <a href="/api/auth/logout" className="text-gray-400 hover:text-gray-600">Sign out</a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Applied", value: total },
            { label: "Response rate", value: `${responseRate}%` },
            { label: "Median days to reply", value: medianDays !== null ? `${medianDays}d` : "—" },
            { label: "Ghost rate", value: `${ghostRate}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-lg border p-4">
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-sm text-gray-700 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Funnel */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Funnel</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {["applied", "screening", "interviewing", "offer"].map((s, i, arr) => (
              <div key={s} className="flex items-center gap-2">
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-900">{byStatus[s] ?? 0}</div>
                  <div className="text-xs text-gray-700 capitalize">{s}</div>
                </div>
                {i < arr.length - 1 && <span className="text-gray-500 text-lg">→</span>}
              </div>
            ))}
            <div className="ml-auto flex gap-4 text-sm text-gray-700">
              <span>{byStatus.rejected ?? 0} rejected</span>
              <span>{byStatus.ghosted ?? 0} ghosted</span>
            </div>
          </div>
        </div>

        {/* Review Queue */}
        <ReviewQueue items={reviewItems} />

        {/* Applications Table */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Applications</h2>
          <ApplicationsTable applications={apps as import("./components/ApplicationsTable").Application[]} />
        </section>

      </div>
    </div>
  );
}
