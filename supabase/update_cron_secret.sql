-- Update cron jobs to use new secret
-- Run this manually in Supabase SQL Editor after setting CRON_SECRET

-- First, unschedule old jobs
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('poll-repos', 'process-queue', 'scan-repos', 'cleanup-audit-logs', 'cleanup-dlq');

-- Re-create with placeholder (update CRON_SECRET_HERE with actual secret)
-- Poll repos for new PRs (every 5 min)
SELECT cron.schedule(
  'poll-repos',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/poll-repos',
    headers := '{"Authorization": "Bearer CRON_SECRET_HERE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

-- Process review queue (every minute)
SELECT cron.schedule(
  'process-queue',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/process-queue',
    headers := '{"Authorization": "Bearer CRON_SECRET_HERE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

-- Security scans (every 2 hours)
SELECT cron.schedule(
  'scan-repos',
  '0 */2 * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos',
    headers := '{"Authorization": "Bearer CRON_SECRET_HERE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
