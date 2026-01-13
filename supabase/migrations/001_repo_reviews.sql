-- Repo review configurations
create table if not exists repo_configs (
  id uuid primary key default gen_random_uuid(),
  full_name text unique not null, -- e.g. "Foodshareclub/repo-name"
  enabled boolean default true,
  auto_review boolean default true,
  categories text[] default array['security', 'bug', 'performance'],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Review history
create table if not exists review_history (
  id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  pr_number int not null,
  status text not null, -- 'pending', 'completed', 'failed'
  result jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_review_history_repo on review_history(repo_full_name);
