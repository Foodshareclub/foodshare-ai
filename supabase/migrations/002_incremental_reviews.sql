-- Add columns for incremental review tracking
alter table review_history add column if not exists head_sha text;
alter table review_history add column if not exists is_incremental boolean default false;
create index if not exists idx_review_history_pr on review_history(repo_full_name, pr_number);
