-- Create security_scans table
CREATE TABLE IF NOT EXISTS security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL,
  security_score INTEGER,
  issues JSONB DEFAULT '[]',
  summary TEXT,
  files_scanned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_scans_repo ON security_scans(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_security_scans_created ON security_scans(created_at DESC);

-- RLS
ALTER TABLE security_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_scans_select" ON security_scans FOR SELECT USING (true);
CREATE POLICY "security_scans_insert" ON security_scans FOR INSERT WITH CHECK (true);

-- Weekly cron job for scanning (Sundays at 2am)
SELECT cron.schedule(
  'scan-repos-weekly',
  '0 2 * * 0',
  $$SELECT net.http_post(
    url := 'https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos',
    headers := '{"Authorization": "Bearer foodshare-cron-2026", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
