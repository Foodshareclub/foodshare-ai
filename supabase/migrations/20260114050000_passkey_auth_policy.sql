-- Allow reading passkeys for authentication (credential IDs only)
CREATE POLICY "passkeys_select_for_auth" ON passkeys FOR SELECT USING (true);

-- Keep existing policy for full access when authenticated
-- passkeys_all already handles INSERT/UPDATE/DELETE for authenticated users
