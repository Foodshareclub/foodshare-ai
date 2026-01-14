-- Add type column to passkey_challenges
ALTER TABLE passkey_challenges ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'authentication';
