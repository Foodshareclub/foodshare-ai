-- Rename PascalCase tables to snake_case
ALTER TABLE "AnalyticsInsight" RENAME TO analytics_insights;
ALTER TABLE "ApiKey" RENAME TO api_keys;
ALTER TABLE "ApiLog" RENAME TO api_logs;
ALTER TABLE "CodeReview" RENAME TO code_reviews;
ALTER TABLE "Conversation" RENAME TO conversations;
ALTER TABLE "Message" RENAME TO messages;
ALTER TABLE "Passkey" RENAME TO passkeys;
ALTER TABLE "PasskeyChallenge" RENAME TO passkey_challenges;
ALTER TABLE "Webhook" RENAME TO webhooks;
ALTER TABLE "WebhookLog" RENAME TO webhook_logs;

-- Update RLS policies with new names
ALTER POLICY "Users can access own analytics" ON analytics_insights RENAME TO "analytics_select";
ALTER POLICY "Users can access own api keys" ON api_keys RENAME TO "api_keys_all";
ALTER POLICY "Users can access own api logs" ON api_logs RENAME TO "api_logs_all";
ALTER POLICY "Users can access own code reviews" ON code_reviews RENAME TO "code_reviews_all";
ALTER POLICY "Users can access own conversations" ON conversations RENAME TO "conversations_all";
ALTER POLICY "Users can access own messages" ON messages RENAME TO "messages_all";
ALTER POLICY "Users can access own passkeys" ON passkeys RENAME TO "passkeys_all";
ALTER POLICY "Users can access own passkey challenges" ON passkey_challenges RENAME TO "passkey_challenges_all";
ALTER POLICY "Users can access own webhooks" ON webhooks RENAME TO "webhooks_all";
ALTER POLICY "Users can access own webhook logs" ON webhook_logs RENAME TO "webhook_logs_all";
