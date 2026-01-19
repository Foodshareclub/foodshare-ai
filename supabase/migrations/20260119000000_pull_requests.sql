-- Migration: Create pull_requests table for storing GitHub PRs with LLM detection
-- Created: 2026-01-19

CREATE TABLE IF NOT EXISTS pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- GitHub identifiers
  github_id BIGINT NOT NULL,
  repo_full_name TEXT NOT NULL,
  number INTEGER NOT NULL,

  -- Core PR data
  title TEXT NOT NULL,
  body TEXT,
  state TEXT NOT NULL DEFAULT 'open',
  draft BOOLEAN DEFAULT FALSE,

  -- Author info
  author_login TEXT NOT NULL,
  author_type TEXT,  -- "User" or "Bot"
  author_id BIGINT,

  -- Timestamps
  github_created_at TIMESTAMPTZ,
  github_updated_at TIMESTAMPTZ,
  github_merged_at TIMESTAMPTZ,

  -- Stats
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  changed_files INTEGER DEFAULT 0,

  -- Branches
  head_ref TEXT,
  base_ref TEXT,
  head_sha TEXT,
  labels TEXT[],
  html_url TEXT,

  -- LLM Detection
  is_llm_generated BOOLEAN DEFAULT FALSE,
  llm_tool TEXT,           -- copilot, cursor, codeium, dependabot, etc.
  llm_confidence DECIMAL(3,2),
  llm_detection_signals JSONB,

  -- Internal
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(repo_full_name, number)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo ON pull_requests(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_pull_requests_llm ON pull_requests(is_llm_generated);
CREATE INDEX IF NOT EXISTS idx_pull_requests_state ON pull_requests(state);
CREATE INDEX IF NOT EXISTS idx_pull_requests_github_id ON pull_requests(github_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_author ON pull_requests(author_login);

-- Trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_pull_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pull_requests_updated_at ON pull_requests;
CREATE TRIGGER pull_requests_updated_at
  BEFORE UPDATE ON pull_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_pull_requests_updated_at();

-- RLS policies
ALTER TABLE pull_requests ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to pull_requests"
  ON pull_requests
  FOR SELECT
  USING (true);

-- Allow insert/update for service role (API operations)
CREATE POLICY "Allow service operations on pull_requests"
  ON pull_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);
