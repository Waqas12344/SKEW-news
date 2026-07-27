-- =============================================================================
-- Skew News — Seed Data
-- Apply after schema.sql in: Supabase Dashboard → SQL Editor → Run
-- Idempotent: safe to run multiple times.
-- =============================================================================

insert into public.sources (name, listing_url, active) values
  ('Reuters',      'https://www.reuters.com/',       true),
  ('NPR',          'https://www.npr.org/',           true),
  ('Fox News',     'https://www.foxnews.com/',       true),
  ('BBC',          'https://www.bbc.com/news',       true),
  ('The Guardian', 'https://www.theguardian.com/us', true)
on conflict (listing_url) do nothing;
