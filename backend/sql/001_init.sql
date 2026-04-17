create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamp not null default now()
);

create table if not exists config (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text not null,
  encrypted boolean not null default true,
  updated_at timestamp not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  script text,
  voice_sample_url text,
  project_type text not null default 'generic',
  status text not null default 'draft',
  created_at timestamp not null default now()
);
-- If the projects table existed before this column was added, make sure it has it.
alter table projects add column if not exists project_type text not null default 'generic';
-- Optional ISO-639 language preference ('en', 'ar', 'fr', etc.); NULL = any language
alter table projects add column if not exists preferred_language text;

-- Pagination state for the last YouTube search (used by "Next 20 videos")
alter table projects add column if not exists last_search_query       text;
alter table projects add column if not exists last_search_page_token  text;

create table if not exists candidate_videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source text not null,
  source_video_id text,
  title text not null,
  url text not null,
  thumbnail_url text,
  duration_sec int,
  description text,
  published_at timestamp,
  search_score numeric(5,4) default 0,
  status text not null default 'discovered',
  domain_tags jsonb not null default '{}'::jsonb,
  match_reason text,
  created_at timestamp not null default now()
);
-- Backfill columns for existing tables
alter table candidate_videos add column if not exists domain_tags jsonb not null default '{}'::jsonb;
alter table candidate_videos add column if not exists match_reason text;

-- Analysis columns (download + screenshot + summary + strengths/weaknesses)
alter table candidate_videos add column if not exists local_video_path    text;
alter table candidate_videos add column if not exists local_thumbnail_path text;
alter table candidate_videos add column if not exists summary            text;
alter table candidate_videos add column if not exists strengths          jsonb not null default '[]'::jsonb;
alter table candidate_videos add column if not exists weaknesses         jsonb not null default '[]'::jsonb;
alter table candidate_videos add column if not exists analysis_status    text not null default 'pending'; -- pending|queued|processing|done|failed
alter table candidate_videos add column if not exists analysis_error     text;
alter table candidate_videos add column if not exists analyzed_at        timestamp;

-- Evaluation scores (4 axes + overall) with per-axis comments, all in one JSONB column.
-- Shape: { "scores":{"convincingness":int, "content_quality":int, "field_relevance":int, "video_quality":int, "overall":int},
--          "comments":{"convincingness":"...", ...},
--          "video_metrics":{"width":int,"height":int,"bitrate":int,"fps":number,"duration_sec":number} }
alter table candidate_videos add column if not exists evaluation jsonb not null default '{}'::jsonb;

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null,
  url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp not null default now()
);

create table if not exists selected_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  candidate_video_id uuid references candidate_videos(id) on delete set null,
  source_start_sec double precision not null default 0,
  source_end_sec double precision not null default 30,
  scene_order int,
  created_at timestamp not null default now()
);

create table if not exists clip_operations (
  id uuid primary key default gen_random_uuid(),
  selected_clip_id uuid not null references selected_clips(id) on delete cascade,
  op_order int not null default 1,
  op_type text not null,
  from_sec double precision not null,
  to_sec double precision not null,
  replacement_asset_id uuid references assets(id) on delete set null,
  layout_mode text,
  text_content text,
  mute_original boolean not null default false,
  speed_factor double precision,
  config jsonb not null default '{}'::jsonb,
  created_at timestamp not null default now()
);

create table if not exists render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  status text not null default 'pending',
  output_url text,
  logs text,
  created_at timestamp not null default now()
);

create index if not exists idx_candidate_videos_project_id on candidate_videos(project_id);
create index if not exists idx_assets_project_id on assets(project_id);
create index if not exists idx_selected_clips_project_id on selected_clips(project_id);
create index if not exists idx_clip_operations_selected_clip_id on clip_operations(selected_clip_id);
create index if not exists idx_render_jobs_project_id on render_jobs(project_id);
