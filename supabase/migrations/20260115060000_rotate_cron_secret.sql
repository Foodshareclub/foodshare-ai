-- Update cron jobs with new secret
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('poll-repos', 'process-queue', 'scan-repos');

SELECT cron.schedule('poll-repos', '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/poll-repos',
    headers := '{"Authorization": "Bearer lQ9G8sXOw0kajwf61PFdoUiTutBltZP3", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$);

SELECT cron.schedule('process-queue', '* * * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/process-queue',
    headers := '{"Authorization": "Bearer lQ9G8sXOw0kajwf61PFdoUiTutBltZP3", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$);

SELECT cron.schedule('scan-repos', '0 */2 * * *',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos',
    headers := '{"Authorization": "Bearer lQ9G8sXOw0kajwf61PFdoUiTutBltZP3", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$);
