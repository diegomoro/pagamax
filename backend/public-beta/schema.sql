-- Public beta managed backend schema.
-- Target: Postgres-compatible managed database with row-level security enabled.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  identity_document_kind text check (identity_document_kind in ('dni', 'cuil')),
  identity_document_last4 text check (identity_document_last4 is null or identity_document_last4 ~ '^[0-9]{4}$'),
  identity_hash text,
  identity_verification_status text not null default 'unverified' check (identity_verification_status in ('unverified', 'pending', 'same_owner_verified', 'mismatch', 'rejected')),
  encrypted_identity_proof bytea,
  status text not null default 'active' check (status in ('active', 'disabled', 'deletion_requested', 'deleted')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  device_binding_hash text not null,
  app_version text,
  platform text,
  device_class text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id, device_binding_hash)
);

create table if not exists public.auth_magic_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'used', 'expired', 'revoked')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  refresh_token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'rotated', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  refreshed_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists public.consents (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  analytics_enabled boolean not null default true,
  merchant_insights_enabled boolean not null default true,
  sponsored_offers_enabled boolean not null default true,
  region_insights_enabled boolean not null default false,
  privacy_version text not null,
  terms_version text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_payment_methods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  instrument_type text not null,
  enabled boolean not null default true,
  can_pay_merchant_qr boolean not null default true,
  alias_label text,
  owner_identity_hash text,
  owner_identity_last4 text check (owner_identity_last4 is null or owner_identity_last4 ~ '^[0-9]{4}$'),
  identity_verification_status text not null default 'unverified' check (identity_verification_status in ('unverified', 'pending', 'same_owner_verified', 'mismatch', 'rejected')),
  preference_rank integer,
  updated_at timestamptz not null default now(),
  unique (account_id, provider, instrument_type)
);

create table if not exists public.funding_destinations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  label text not null,
  encrypted_alias_payload bytea not null,
  alias_hash text not null,
  cvu_hash text,
  display_hint text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'same_owner_verified', 'rejected')),
  same_owner_proof_status text not null default 'unverified' check (same_owner_proof_status in ('unverified', 'verified', 'same_owner_verified', 'rejected')),
  owner_identity_hash text,
  owner_identity_last4 text check (owner_identity_last4 is null or owner_identity_last4 ~ '^[0-9]{4}$'),
  identity_verification_status text not null default 'unverified' check (identity_verification_status in ('unverified', 'pending', 'same_owner_verified', 'mismatch', 'rejected')),
  funding_priority integer not null default 100,
  max_transaction_cents integer check (max_transaction_cents is null or max_transaction_cents >= 0),
  daily_limit_remaining_cents integer check (daily_limit_remaining_cents is null or daily_limit_remaining_cents >= 0),
  checkout_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider, alias_hash)
);

create table if not exists public.checkout_route_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  route_id text not null unique,
  nonce_hash text not null unique,
  qr_hash text not null,
  merchant_name text not null,
  amount_cents integer not null check (amount_cents > 0),
  provider text not null,
  android_package text not null,
  funding_rail text not null,
  destination_alias_hash text,
  account_identity_hash text,
  account_identity_verification_status text check (account_identity_verification_status in ('unverified', 'pending', 'same_owner_verified', 'mismatch', 'rejected')),
  method_owner_identity_hash text,
  method_owner_identity_verification_status text check (method_owner_identity_verification_status in ('unverified', 'pending', 'same_owner_verified', 'mismatch', 'rejected')),
  status text not null default 'issued' check (status in ('issued', 'opened', 'expired', 'revoked', 'completed', 'failed')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  opened_at timestamptz,
  completed_at timestamptz,
  failure_reason text
);

create index if not exists checkout_route_plans_account_idx on public.checkout_route_plans(account_id, issued_at desc);
create index if not exists checkout_route_plans_qr_idx on public.checkout_route_plans(qr_hash, amount_cents);

create table if not exists public.funding_pair_capabilities (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null,
  target_provider text not null,
  rail text not null check (rail in ('debin_pull', 'verified_prefilled_transfer', 'wallet_scanner', 'unsupported')),
  status text not null check (status in ('instant', 'prefill_possible', 'prepare_before_checkout', 'blocked')),
  expected_seconds integer not null check (expected_seconds >= 0),
  max_amount_cents integer check (max_amount_cents is null or max_amount_cents >= 0),
  friction_score_cents integer check (friction_score_cents is null or friction_score_cents >= 0),
  failure_risk_score_cents integer check (failure_risk_score_cents is null or failure_risk_score_cents >= 0),
  source_android_package text,
  target_android_package text,
  handoff_url text,
  enabled boolean not null default false,
  verification_timestamp timestamptz,
  verification_notes jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_provider, target_provider, rail)
);

create index if not exists funding_pair_capabilities_lookup_idx
  on public.funding_pair_capabilities(source_provider, target_provider, enabled, status);

create table if not exists public.liquidity_route_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  route_id text not null unique,
  nonce_hash text not null unique,
  qr_hash text not null,
  merchant_name text not null,
  amount_cents integer not null check (amount_cents > 0),
  source_provider text not null,
  source_account_id text not null,
  source_alias_hash text,
  target_provider text not null,
  target_account_id text not null,
  target_alias_hash text,
  funding_rail text not null check (funding_rail in ('ready_balance', 'debin_pull', 'verified_prefilled_transfer', 'wallet_scanner', 'unsupported')),
  funding_status text not null check (funding_status in ('instant', 'prefill_possible', 'prepare_before_checkout', 'blocked')),
  payment_android_package text not null,
  funding_android_package text,
  account_identity_hash text,
  status text not null default 'issued' check (status in ('issued', 'funding_opened', 'funding_confirmed', 'payment_opened', 'user_marked_done', 'failed', 'expired', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  funding_opened_at timestamptz,
  funding_confirmed_at timestamptz,
  payment_opened_at timestamptz,
  user_marked_done_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);

create index if not exists liquidity_route_plans_account_idx on public.liquidity_route_plans(account_id, issued_at desc);
create index if not exists liquidity_route_plans_qr_idx on public.liquidity_route_plans(qr_hash, amount_cents);

create table if not exists public.liquidity_route_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  route_plan_id uuid references public.liquidity_route_plans(id) on delete cascade,
  route_id text not null,
  event_type text not null check (event_type in ('issued', 'funding_opened', 'funding_confirmed', 'payment_opened', 'user_marked_done', 'failed')),
  provider text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (route_id, event_type)
);

create index if not exists liquidity_route_events_route_idx on public.liquidity_route_events(route_id, created_at);

create table if not exists public.saved_merchants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  merchant_name text not null,
  merchant_category text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (account_id, merchant_name)
);

create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  event_name text not null,
  merchant_name text,
  merchant_category text,
  amount_band text,
  recommendation_position integer,
  selected_provider text,
  handoff_target text,
  is_sponsored boolean not null default false,
  stale_data boolean not null default false,
  app_version text,
  device_class text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists telemetry_events_created_idx on public.telemetry_events(created_at);
create index if not exists telemetry_events_merchant_idx on public.telemetry_events(merchant_name, merchant_category);

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  email text,
  status text not null default 'requested' check (status in ('requested', 'processing', 'completed', 'rejected')),
  retained_for_security boolean not null default true,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  audit_note text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_account_id uuid references public.accounts(id) on delete set null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.remote_configs (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  variant text not null,
  signed_payload jsonb not null,
  signature text not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  merchant_name text not null,
  category text,
  owner_account_id uuid references public.accounts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsored_offers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  title text not null,
  category text,
  eligibility jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  budget_cents integer not null check (budget_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'active', 'paused', 'ended', 'rejected')),
  ranking_policy text not null default 'labeled_secondary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchant_offer_metrics (
  offer_id uuid not null references public.sponsored_offers(id) on delete cascade,
  metric_date date not null,
  merchant_category text,
  amount_band text,
  exposures integer not null default 0,
  selections integer not null default 0,
  handoffs integer not null default 0,
  saved_merchants integer not null default 0,
  feedback_positive integer not null default 0,
  feedback_negative integer not null default 0,
  primary key (offer_id, metric_date, merchant_category, amount_band)
);

create table if not exists public.issuer_insight_exports (
  id uuid primary key default gen_random_uuid(),
  issuer_name text not null,
  period_start date not null,
  period_end date not null,
  aggregate_payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
alter table public.devices enable row level security;
alter table public.auth_magic_links enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.consents enable row level security;
alter table public.user_payment_methods enable row level security;
alter table public.funding_destinations enable row level security;
alter table public.checkout_route_plans enable row level security;
alter table public.funding_pair_capabilities enable row level security;
alter table public.liquidity_route_plans enable row level security;
alter table public.liquidity_route_events enable row level security;
alter table public.saved_merchants enable row level security;
alter table public.telemetry_events enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.remote_configs enable row level security;
alter table public.merchant_profiles enable row level security;
alter table public.sponsored_offers enable row level security;
alter table public.merchant_offer_metrics enable row level security;
alter table public.issuer_insight_exports enable row level security;
