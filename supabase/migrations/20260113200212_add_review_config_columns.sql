alter table repo_configs add column if not exists ignore_paths text[] default array[]::text[];
alter table repo_configs add column if not exists custom_instructions text default '';
