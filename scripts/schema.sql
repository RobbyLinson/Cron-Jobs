-- Enable pg_trgm for fuzzy company name matching (used in sync pipeline)
create extension if not exists pg_trgm;

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company text not null,
  role text,
  location text,
  source text,
  status text not null default 'applied',
  applied_at timestamptz,
  last_contact_at timestamptz,
  email_count int default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid references applications(id),
  gmail_message_id text unique not null,
  thread_id text,
  from_address text,
  subject text,
  received_at timestamptz,
  snippet text,
  extracted jsonb,
  classification text,
  confidence float,
  needs_review boolean default false,
  created_at timestamptz default now()
);

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  emails_processed int default 0,
  errors jsonb,
  status text default 'running'
);

create table if not exists oauth_tokens (
  user_id uuid primary key,
  encrypted_refresh_token text not null,
  scope text,
  updated_at timestamptz default now()
);

create index if not exists emails_user_received_idx on emails(user_id, received_at desc);
create index if not exists emails_application_idx on emails(application_id);
create index if not exists applications_user_status_idx on applications(user_id, status);
-- Index for pg_trgm fuzzy matching on company name
create index if not exists applications_company_trgm_idx on applications using gin(company gin_trgm_ops);
