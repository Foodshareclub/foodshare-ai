-- This migration requires pg_cron to be enabled first via Dashboard
-- Go to: Database → Extensions → Enable pg_cron

-- Schedule poll-repos every 5 minutes
SELECT cron.schedule(
  'poll-repos',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/poll-repos',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

-- Schedule process-queue every minute  
SELECT cron.schedule(
  'process-queue',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/process-queue',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
