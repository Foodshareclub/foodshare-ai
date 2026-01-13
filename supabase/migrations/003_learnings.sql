-- Learnings from past reviews (patterns to remember)
create table if not exists review_learnings (
  id uuid primary key default gen_random_uuid(),
  repo_full_name text not null,
  pattern text not null,
  learning text not null,
  category text,
  created_at timestamptz default now()
);

create index if not exists idx_learnings_repo on review_learnings(repo_full_name);
