# PRD: Job Application Email Tracker

## Overview

A personal job application tracker that reads Gmail daily, uses an LLM to extract structured data from job-related emails, and surfaces a dashboard + daily digest of pipeline status. Single-user, BYOK (bring your own keys), public repo.

## Goals

- Eliminate manual spreadsheet updates during an active job search.
- Track every application's status from confirmation through rejection / offer / ghost.
- Produce metrics a spreadsheet won't easily give: response rate by source, median time-to-response, funnel conversion, ghost rate.
- Demo well as a portfolio piece — clean OAuth integration, structured LLM extraction, useful UI.

## Non-Goals

- Multi-user / SaaS. Architecture should be multi-user-clean, but no signups, billing, or team features.
- Real-time email processing. Daily batch is sufficient.
- Replying to emails or any write actions on Gmail. Read-only.
- Fully autonomous "agent" behavior. This is a deterministic pipeline with an LLM step, not an agent loop.

## Stack

- **Framework:** Next.js (App Router), TypeScript
- **DB:** Vercel Postgres (Neon)
- **Hosting:** Vercel (hobby plan, daily cron is free)
- **Email API:** Gmail API via `googleapis`, read-only scope
- **LLM:** Anthropic API, tool use for structured extraction
- **Digest delivery:** Resend (free tier) — optional for v1, dashboard works without it
- **Auth (app login):** Single-user — magic link via Resend, or hardcoded password check from env. No multi-user auth system.

## Architecture

Three surfaces in one Next.js app:

1. **OAuth flow** — `/api/auth/google` → `/api/auth/google/callback`. Stores encrypted refresh token in DB.
2. **Daily cron** — `/api/cron/sync` triggered by Vercel cron at ~07:00 user time. Idempotent.
3. **Dashboard** — `/dashboard` lists applications, status, last contact, review queue, and daily stats. Includes a "Run sync now" button hitting the same endpoint as the cron.

## Data Model

```sql
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company text not null,
  role text,
  location text,
  source text,                          -- 'greenhouse', 'lever', 'ashby', 'direct', etc.
  status text not null default 'applied', -- applied | screening | interviewing | offer | rejected | ghosted | withdrawn
  applied_at timestamptz,
  last_contact_at timestamptz,
  email_count int default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid references applications(id),
  gmail_message_id text unique not null,  -- idempotency key
  thread_id text,
  from_address text,
  subject text,
  received_at timestamptz,
  snippet text,
  extracted jsonb,                        -- raw LLM output for debugging
  classification text,                    -- application_confirmation | rejection | interview_invite | offer | recruiter_outreach | other
  confidence float,
  needs_review boolean default false,
  created_at timestamptz default now()
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  emails_processed int default 0,
  errors jsonb,
  status text default 'running'           -- running | success | failed
);

create table oauth_tokens (
  user_id uuid primary key,
  encrypted_refresh_token text not null,
  scope text,
  updated_at timestamptz default now()
);

create index on emails(user_id, received_at desc);
create index on emails(application_id);
create index on applications(user_id, status);
```

`user_id` stays in the schema even though there's only one user — keeps the design clean and avoids a migration if scope ever expands.

## Sync Pipeline

Triggered once daily by Vercel cron, also manually via dashboard button.

1. Load `last_synced_at` from latest successful `sync_runs` row.
2. `gmail.users.messages.list` with `q=newer_than:Xd after:<last_synced_at>`. Page through results.
3. For each new message, fetch full payload. Skip if `gmail_message_id` already exists (idempotent).
4. **Pass 1 — classify (batched):** send subjects + snippets in a single Anthropic call, return classification per message. Cheap filter — most inbox content isn't job-related.
5. **Pass 2 — extract (batched):** for job-related messages only, send full body to Anthropic with tool use. Schema: `{company, role, location, classification, confidence, reasoning}`. Use prompt caching on the system prompt.
6. **Match to application:**
   - Same `thread_id` as existing email → same `application_id`. (Handles ~70% of cases.)
   - Otherwise fuzzy match `company` against open applications using `pg_trgm` (similarity > 0.6).
   - No match → create new `applications` row.
   - Confidence < 0.7 OR ambiguous match → set `needs_review = true`.
7. Update parent application: `status` (per classification rules below), `last_contact_at`, increment `email_count`.
8. Write `sync_runs` row with stats.
9. (Optional v1.1) Send digest email via Resend.

### Status transition rules

- `application_confirmation` → keep status `applied`, set `applied_at` if null.
- `recruiter_outreach` → status `screening`.
- `interview_invite` → status `interviewing`.
- `offer` → status `offer`.
- `rejection` → status `rejected`.
- `other` → no status change.
- Nightly job (or part of cron): any application with `last_contact_at` > 21 days ago and status in (`applied`, `screening`) → `ghosted`.

## Dashboard

- **Pipeline view:** kanban-style columns by status, or a sortable table. Table is faster to ship.
- **Review queue:** all rows where `needs_review = true`. Inline edit company / role / status, then mark resolved.
- **Stats panel:** total applied, response rate, median days to first response, ghost rate, funnel counts (applied → screening → interviewing → offer), response rate broken down by source.
- **Last sync indicator:** timestamp + "Run sync now" button.
- **Per-application detail:** chronological email list, snippets, classifications.

## Security

- Refresh token must be encrypted at rest. Use AES-256-GCM with key from `ENCRYPTION_KEY` env var, or `pgsodium` if available. Never commit, never log.
- Anthropic key, Google client secret, encryption key all in Vercel env vars.
- Cron endpoint protected with `CRON_SECRET` header check (Vercel sets `Authorization: Bearer $CRON_SECRET` automatically when configured).
- Manual sync button uses session check (whatever auth method is chosen).
- README must clearly explain BYOK setup: Google Cloud project, OAuth credentials, Anthropic key, env var list.

## Gmail API Notes

- Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
- Refresh token only returned on first auth — store immediately, or pass `prompt=consent` to force re-issue.
- During development, add yourself as a test user in Google Cloud Console. Skip app verification.
- Use date-based incremental sync (`last_synced_at`) for v1. Don't bother with `historyId` / Gmail History API — added complexity, no benefit at one sync per day.

## Environment Variables

```
DATABASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
ANTHROPIC_API_KEY=
ENCRYPTION_KEY=                # 32 bytes, base64
CRON_SECRET=                   # set by Vercel cron config
RESEND_API_KEY=                # optional, for digest
APP_PASSWORD=                  # if using password auth
```

## Build Order

1. Next.js scaffold, Vercel Postgres connection, schema migration, env var setup.
2. Google OAuth flow end-to-end. Verify refresh token round-trips through encryption.
3. Gmail fetch → classify → extract → upsert pipeline. Test on a manual trigger before wiring cron.
4. Dashboard: applications table, review queue, stats panel.
5. Vercel cron config + manual trigger button.
6. (Optional) Resend digest email.
7. README with BYOK setup walkthrough and architecture diagram.

## Out of Scope for v1

- Multi-account Gmail.
- Calendar integration to auto-add interviews.
- Resume / cover letter linking per application.
- Browser extension for one-click logging from job sites.
- Slack / Discord notifications.

## Success Criteria

- All emails received during a 7-day test window correctly classified or surfaced for review (no silent misfiles).
- Dashboard shows accurate funnel and response-rate stats.
- Daily cron runs unattended for a week without manual intervention.
- Public repo with README clear enough that someone else could fork and run it with their own keys.
