-- Run this in Supabase SQL Editor after enabling pg_cron extension

-- 1. First enable pg_cron in Dashboard: Database → Extensions → pg_cron

-- 2. Schedule poll-repos every 5 minutes
SELECT cron.schedule(
  'poll-repos',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/poll-repos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3. Schedule process-queue every minute  
SELECT cron.schedule(
  'process-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/process-queue',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('poll-repos');
-- SELECT cron.unschedule('process-queue');
