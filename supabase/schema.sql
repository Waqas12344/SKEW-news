-- =============================================================================
-- Skew News — Database Schema
-- Apply in: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- Extensions
create extension if not exists pgcrypto; -- gen_random_uuid()

-- =============================================================================
-- sources
-- =============================================================================
create table if not exists public.sources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  listing_url     text not null unique,
  parser_strategy text,
  active          boolean not null default true,
  logo_url        text,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- articles (append-only; §10)
-- =============================================================================
create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.sources(id) on delete cascade,
  url           text not null unique,        -- original URL, dedupe key (§10)
  canonical_url text,
  title         text not null,
  image_url     text not null,               -- required before saving (§13)
  published_at  timestamptz not null,        -- required before saving (§13)
  raw_text      text not null default '',
  scraped_at    timestamptz not null default now(),
  analyzed_at   timestamptz,                 -- null until analysis saved (§19)
  created_at    timestamptz not null default now()
);

create index if not exists articles_source_id_idx    on public.articles(source_id);
create index if not exists articles_published_at_idx on public.articles(published_at desc);
create index if not exists articles_analyzed_at_idx  on public.articles(analyzed_at);

-- =============================================================================
-- article_analyses (one per article; §19)
-- embedding vector(1536) added in §20 — requires pgvector extension
-- =============================================================================
create extension if not exists vector; -- pgvector (§20)

create table if not exists public.article_analyses (
  id                uuid primary key default gen_random_uuid(),
  article_id        uuid not null unique references public.articles(id) on delete cascade,
  summary           text not null,
  sentiment_score   numeric(4,3) not null check (sentiment_score between -1 and 1),
  sentiment_label   text not null check (sentiment_label in ('positive','neutral','negative')),
  bias_score        numeric(4,3) not null check (bias_score between -1 and 1),
  bias_label        text not null check (bias_label in ('left','center','right','mixed','unclear')),
  left_percentage   int not null check (left_percentage between 0 and 100),
  center_percentage int not null check (center_percentage between 0 and 100),
  right_percentage  int not null check (right_percentage between 0 and 100),
  confidence        numeric(4,3) not null check (confidence between 0 and 1),
  framing_notes     text,
  loaded_terms      text[] not null default '{}',
  disclaimer        text,
  model             text not null,
  embedding         vector(1536),             -- §20 pgvector similarity search
  created_at        timestamptz not null default now(),
  constraint article_analyses_pct_sum
    check (left_percentage + center_percentage + right_percentage = 100)
);

-- IVFFlat cosine index for similarity search (§20)
create index if not exists article_analyses_embedding_idx
  on public.article_analyses
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 1);

-- match_articles RPC — returns up to match_count similar articles by cosine distance (§20)
create or replace function public.match_articles(
  query_embedding  vector(1536),
  match_count      int,
  exclude_id       uuid
)
returns table (
  article_id   uuid,
  title        text,
  image_url    text,
  published_at timestamptz,
  source_name  text
)
language sql
security invoker
set search_path = public, extensions
as $$
  select
    a.id          as article_id,
    a.title,
    a.image_url,
    a.published_at,
    s.name        as source_name
  from article_analyses aa
  join articles a  on a.id = aa.article_id
  join sources  s  on s.id = a.source_id
  where aa.embedding is not null
    and aa.article_id <> exclude_id
    and a.analyzed_at is not null
  order by aa.embedding <=> query_embedding
  limit match_count;
$$;

-- =============================================================================
-- logs (§7)
-- =============================================================================
create table if not exists public.logs (
  id         uuid primary key default gen_random_uuid(),
  level      text not null default 'info'
               check (level in ('debug','info','warn','error')),
  event      text not null,
  message    text,
  context    jsonb,
  source_id  uuid references public.sources(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists logs_created_at_idx on public.logs(created_at desc);

-- =============================================================================
-- oxylabs_schedules (§18; IDs stored as text for 64-bit precision)
-- =============================================================================
create table if not exists public.oxylabs_schedules (
  id          uuid primary key default gen_random_uuid(),
  schedule_id text not null unique,
  source_id   uuid not null references public.sources(id) on delete cascade,
  cron        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- oxylabs_schedule_runs (§18; run/job IDs as text)
-- =============================================================================
create table if not exists public.oxylabs_schedule_runs (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   text not null
                  references public.oxylabs_schedules(schedule_id) on delete cascade,
  run_id        text not null,
  job_id        text,
  result_status text,
  processed     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (schedule_id, run_id, job_id)
);

create index if not exists oxylabs_runs_schedule_idx
  on public.oxylabs_schedule_runs(schedule_id);

-- =============================================================================
-- RLS — enable on every table; no anon/authenticated policies.
-- All app reads/writes go through the server service-role client (bypasses RLS).
-- =============================================================================
alter table public.sources               enable row level security;
alter table public.articles              enable row level security;
alter table public.article_analyses      enable row level security;
alter table public.logs                  enable row level security;
alter table public.oxylabs_schedules     enable row level security;
alter table public.oxylabs_schedule_runs enable row level security;
