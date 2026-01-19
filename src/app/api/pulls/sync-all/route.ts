import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, err, handleError } from "@/lib/api";
import { syncRepoPRs } from "@/lib/pr-store";

interface SyncResult {
  repo: string;
  synced: number;
  errors: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { state = "open" } = body as { state?: "open" | "closed" | "all" };

    const supabase = await createClient();

    // Fetch all enabled repos from repo_configs
    const { data: configs, error: configError } = await supabase
      .from("repo_configs")
      .select("full_name")
      .eq("enabled", true);

    if (configError) throw configError;

    if (!configs || configs.length === 0) {
      return err("No enabled repos found. Configure repos in the dashboard first.");
    }

    const results: SyncResult[] = [];
    const allErrors: string[] = [];
    let totalSynced = 0;

    // Sync each repo sequentially to respect rate limits
    for (const config of configs) {
      const [owner, repo] = config.full_name.split("/");
      if (!owner || !repo) {
        allErrors.push(`Invalid repo format: ${config.full_name}`);
        continue;
      }

      try {
        const result = await syncRepoPRs(owner, repo, state);
        results.push({
          repo: config.full_name,
          synced: result.synced,
          errors: result.errors,
        });
        totalSynced += result.synced;
        if (result.errors.length > 0) {
          allErrors.push(...result.errors.map(e => `${config.full_name}: ${e}`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        allErrors.push(`${config.full_name}: ${msg}`);
        results.push({
          repo: config.full_name,
          synced: 0,
          errors: [msg],
        });
      }
    }

    return ok({
      message: `Synced ${totalSynced} PRs from ${configs.length} repos`,
      repos: configs.length,
      synced: totalSynced,
      results,
      errors: allErrors.length > 0 ? allErrors : undefined,
    });
  } catch (error) {
    return handleError(error);
  }
}
