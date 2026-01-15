-- Tool audit logs for enterprise compliance
CREATE TABLE IF NOT EXISTS tool_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  ip_address TEXT,
  params JSONB DEFAULT '{}',
  success BOOLEAN NOT NULL,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_tool_audit_correlation ON tool_audit_logs(correlation_id);
CREATE INDEX idx_tool_audit_tool_name ON tool_audit_logs(tool_name);
CREATE INDEX idx_tool_audit_user ON tool_audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_tool_audit_created ON tool_audit_logs(created_at DESC);
CREATE INDEX idx_tool_audit_errors ON tool_audit_logs(created_at DESC) WHERE success = false;

-- Retention policy: auto-delete logs older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM tool_audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (if pg_cron available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-tool-audit', '0 3 * * 0', 'SELECT cleanup_old_audit_logs()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- RLS policies
ALTER TABLE tool_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON tool_audit_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own audit logs" ON tool_audit_logs
  FOR SELECT USING (auth.uid() = user_id);
