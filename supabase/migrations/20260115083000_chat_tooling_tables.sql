-- Add missing tables and columns for chat tooling

-- Review queue table (tools expect this, we have review_jobs)
CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  depth TEXT DEFAULT 'standard',
  attempts INTEGER DEFAULT 0,
  error TEXT,
  requested_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_repo ON review_queue(repo_full_name);

-- Add missing columns to security_scans
ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS critical_count INTEGER DEFAULT 0;
ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS high_count INTEGER DEFAULT 0;
ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS medium_count INTEGER DEFAULT 0;
ALTER TABLE security_scans ADD COLUMN IF NOT EXISTS findings JSONB DEFAULT '[]';

-- Update existing rows to have grade based on security_score
UPDATE security_scans SET 
  score = COALESCE(security_score, 0),
  grade = CASE 
    WHEN COALESCE(security_score, 0) >= 90 THEN 'A'
    WHEN COALESCE(security_score, 0) >= 80 THEN 'B'
    WHEN COALESCE(security_score, 0) >= 70 THEN 'C'
    WHEN COALESCE(security_score, 0) >= 60 THEN 'D'
    ELSE 'F'
  END,
  findings = COALESCE(issues, '[]')
WHERE score IS NULL;

-- Add missing columns to repo_configs
ALTER TABLE repo_configs ADD COLUMN IF NOT EXISTS repo_full_name TEXT;
ALTER TABLE repo_configs ADD COLUMN IF NOT EXISTS review_depth TEXT DEFAULT 'standard';
ALTER TABLE repo_configs ADD COLUMN IF NOT EXISTS ignore_patterns TEXT[] DEFAULT '{}';
ALTER TABLE repo_configs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Sync repo_full_name from full_name
UPDATE repo_configs SET repo_full_name = full_name WHERE repo_full_name IS NULL;

-- Create reviews table if not exists (tools expect this)
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  score INTEGER,
  status TEXT DEFAULT 'completed',
  summary TEXT,
  comments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_repo ON reviews(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);

-- Migrate data from review_history to reviews if needed
INSERT INTO reviews (id, repo_full_name, pr_number, status, summary, created_at)
SELECT id, repo_full_name, pr_number, status, 
  result->>'summary' as summary,
  created_at
FROM review_history
WHERE NOT EXISTS (SELECT 1 FROM reviews WHERE reviews.id = review_history.id)
ON CONFLICT (id) DO NOTHING;

-- RLS for new tables
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_queue_all" ON review_queue FOR ALL USING (true);
CREATE POLICY "reviews_all" ON reviews FOR ALL USING (true);
