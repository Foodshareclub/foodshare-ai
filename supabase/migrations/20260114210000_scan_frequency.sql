-- Update scan frequency to every 2 hours
SELECT cron.unschedule('scan-repos');
SELECT cron.schedule(
  'scan-repos',
  '0 */2 * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
