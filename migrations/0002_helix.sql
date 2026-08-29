-- Helix application schema. Auth tables live in 0001_auth.sql.

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  conduct_version text not null default '2026.08',
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  name text not null,
  region text not null,
  focus text not null,
  created_at timestamptz not null default now()
);
create index if not exists teams_org_idx on teams (org_id);

create table if not exists memberships (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  user_id text not null,
  team_id text references teams(id) on delete set null,
  role text not null,
  title text not null,
  accepted_conduct_at timestamptz,
  conflict_disclosed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on memberships (user_id);
create index if not exists memberships_team_idx on memberships (team_id);

create table if not exists wallets (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  user_id text not null,
  balance_milli integer not null,
  allocated_milli integer not null,
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists wallets_user_idx on wallets (user_id);

create table if not exists wallet_ledger (
  id text primary key,
  wallet_id text not null references wallets(id) on delete cascade,
  user_id text not null,
  amount_milli integer not null,
  balance_after_milli integer not null,
  kind text not null,
  ref_type text,
  ref_id text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_ledger_user_idx on wallet_ledger (user_id, created_at desc);

create table if not exists kpis (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  unit text not null,
  description text not null,
  crm_field text not null,
  unique (org_id, key)
);

create table if not exists crm_reps (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  user_id text,
  name text not null,
  seat text not null,
  quota_cents integer not null,
  pipeline_cents integer not null,
  closed_won_cents integer not null,
  deal_count integer not null,
  avg_cycle_days numeric(10, 2) not null,
  ramp_complete boolean not null default false,
  hire_date date not null
);
create index if not exists crm_reps_team_idx on crm_reps (team_id);

create table if not exists crm_team_metrics (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  period text not null,
  quota_cents integer not null,
  closed_won_cents integer not null,
  pipeline_cents integer not null,
  deal_count integer not null,
  avg_cycle_days numeric(10, 2) not null,
  updated_at timestamptz not null default now(),
  unique (team_id, period)
);

create table if not exists governance (
  org_id text primary key references organizations(id) on delete cascade,
  default_allocation_milli integer not null,
  max_position_milli integer not null,
  max_loss_milli integer not null,
  leaderboard_visibility text not null,
  data_retention_days integer not null,
  comments_enabled boolean not null default true,
  auto_resolve_enabled boolean not null default true,
  individual_markets_enabled boolean not null default true,
  voluntary_participation boolean not null default true,
  employment_disclaimer text not null,
  banned_topics text not null
);

create table if not exists market_templates (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  name text not null,
  title_pattern text not null,
  market_type text not null,
  resolution_pattern text not null,
  default_b numeric(12, 4) not null,
  kpi_key text
);

create table if not exists markets (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  created_by text not null,
  owner_user_id text not null,
  title text not null,
  description text not null,
  market_type text not null,
  status text not null,
  scope text not null,
  team_id text references teams(id) on delete set null,
  subject_user_id text,
  subject_consent_at timestamptz,
  privacy text not null,
  kpi_id text references kpis(id) on delete set null,
  measurement_period text not null,
  resolution_statement text not null,
  data_source text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  resolve_after timestamptz not null,
  liquidity_b numeric(12, 4) not null,
  max_position_milli integer not null,
  eligibility text not null,
  featured boolean not null default false,
  comments_enabled boolean not null default true,
  auto_resolve boolean not null default false,
  cancel_reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists markets_status_idx on markets (org_id, status, closes_at);
create index if not exists markets_team_idx on markets (team_id);

create table if not exists market_outcomes (
  id text primary key,
  market_id text not null references markets(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order integer not null,
  quantity numeric(20, 8) not null,
  is_winner boolean,
  unique (market_id, key)
);
create index if not exists market_outcomes_market_idx on market_outcomes (market_id);

create table if not exists trades (
  id text primary key,
  market_id text not null references markets(id) on delete cascade,
  user_id text not null,
  outcome_id text not null references market_outcomes(id),
  side text not null,
  shares numeric(20, 8) not null,
  cost_milli integer not null,
  avg_price numeric(12, 8) not null,
  prob_before numeric(12, 8) not null,
  prob_after numeric(12, 8) not null,
  created_at timestamptz not null default now()
);
create index if not exists trades_market_idx on trades (market_id, created_at desc);
create index if not exists trades_user_idx on trades (user_id, created_at desc);

create table if not exists positions (
  id text primary key,
  market_id text not null references markets(id) on delete cascade,
  user_id text not null,
  outcome_id text not null references market_outcomes(id),
  shares numeric(20, 8) not null,
  cost_basis_milli integer not null,
  updated_at timestamptz not null default now(),
  unique (market_id, user_id, outcome_id)
);
create index if not exists positions_user_idx on positions (user_id);

create table if not exists probability_ticks (
  id text primary key,
  market_id text not null references markets(id) on delete cascade,
  captured_at timestamptz not null,
  probs jsonb not null
);
create index if not exists probability_ticks_market_idx on probability_ticks (market_id, captured_at);

create table if not exists resolutions (
  id text primary key,
  market_id text not null references markets(id) on delete cascade,
  resolved_by text not null,
  winning_outcome_id text not null,
  source_value text not null,
  note text,
  auto boolean not null default false,
  resolved_at timestamptz not null default now()
);

create table if not exists disputes (
  id text primary key,
  market_id text not null references markets(id) on delete cascade,
  opened_by text not null,
  reason text not null,
  status text not null,
  admin_note text,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists disputes_market_idx on disputes (market_id);

create table if not exists comments (
  id text primary key,
  market_id text not null references markets(id) on delete cascade,
  user_id text not null,
  body text not null,
  anonymous boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_market_idx on comments (market_id, created_at desc);

create table if not exists notifications (
  id text primary key,
  user_id text not null,
  type text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists audit_events (
  id text primary key,
  org_id text not null,
  actor_user_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_org_idx on audit_events (org_id, created_at desc);
create index if not exists audit_events_entity_idx on audit_events (entity_type, entity_id);
