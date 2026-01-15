import { createClient } from "./supabase/server";

interface NotifyOptions {
  type: "error" | "warning" | "info";
  message: string;
  metadata?: Record<string, any>;
}

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

export async function notify({ type, message, metadata }: NotifyOptions): Promise<void> {
  const supabase = await createClient();
  
  // Log to database
  await supabase.from("notifications").insert({
    type,
    channel: SLACK_WEBHOOK ? "slack" : DISCORD_WEBHOOK ? "discord" : "log",
    message,
    metadata,
  });

  // Send to Slack
  if (SLACK_WEBHOOK) {
    const emoji = type === "error" ? "🔴" : type === "warning" ? "🟡" : "🔵";
    try {
      await fetch(SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${emoji} *${type.toUpperCase()}*: ${message}`,
          attachments: metadata ? [{
            color: type === "error" ? "danger" : type === "warning" ? "warning" : "good",
            fields: Object.entries(metadata).map(([k, v]) => ({
              title: k,
              value: String(v),
              short: true,
            })),
          }] : undefined,
        }),
      });
    } catch (e) {
      console.error("Slack notification failed:", e);
    }
  }

  // Send to Discord
  if (DISCORD_WEBHOOK) {
    const color = type === "error" ? 0xff0000 : type === "warning" ? 0xffaa00 : 0x0099ff;
    try {
      await fetch(DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `${type.toUpperCase()}: AI Code Review`,
            description: message,
            color,
            fields: metadata ? Object.entries(metadata).map(([k, v]) => ({
              name: k,
              value: String(v),
              inline: true,
            })) : undefined,
            timestamp: new Date().toISOString(),
          }],
        }),
      });
    } catch (e) {
      console.error("Discord notification failed:", e);
    }
  }

  // Always log
  console.log(`[${type.toUpperCase()}] ${message}`, metadata || "");
}

export async function notifyReviewFailed(
  repo: string,
  prNumber: number,
  error: string,
  attempt: number,
  willRetry: boolean
): Promise<void> {
  await notify({
    type: willRetry ? "warning" : "error",
    message: willRetry 
      ? `Review failed, will retry (attempt ${attempt})`
      : `Review permanently failed after ${attempt} attempts`,
    metadata: {
      repo,
      pr: `#${prNumber}`,
      error: error.slice(0, 200),
    },
  });
}

export async function notifySecurityIssue(
  repo: string,
  prNumber: number,
  severity: "critical" | "high" | "medium",
  issue: string
): Promise<void> {
  await notify({
    type: severity === "critical" ? "error" : "warning",
    message: `🚨 ${severity.toUpperCase()} security issue detected`,
    metadata: {
      repo,
      pr: `#${prNumber}`,
      severity,
      issue: issue.slice(0, 300),
    },
  });
}

export async function notifyReviewCompleted(
  repo: string,
  prNumber: number,
  issueCount: number,
  securityIssues: number = 0
): Promise<void> {
  await notify({
    type: securityIssues > 0 ? "warning" : "info",
    message: `✅ Review completed: ${issueCount} issues, ${securityIssues} security`,
    metadata: { 
      repo, 
      pr: `#${prNumber}`,
      total_issues: issueCount,
      security_issues: securityIssues,
    },
  });
}
