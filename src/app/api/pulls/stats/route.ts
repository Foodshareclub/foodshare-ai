import { NextRequest } from "next/server";
import { ok, handleError } from "@/lib/api";
import { getPRStats, getStoredRepos } from "@/lib/pr-store";
import { getToolDisplayLabel, getToolEmoji } from "@/lib/llm-detection";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");

    const repoFullName = owner && repo ? `${owner}/${repo}` : undefined;
    const stats = await getPRStats(repoFullName);
    const repos = await getStoredRepos();

    // Calculate percentage
    const llmPercentage = stats.total > 0
      ? Math.round((stats.llmGenerated / stats.total) * 100)
      : 0;

    // Enrich tool data with display names
    const byToolEnriched = Object.entries(stats.byTool).map(([tool, count]) => ({
      tool,
      display: getToolDisplayLabel(tool),
      emoji: getToolEmoji(tool),
      count,
      percentage: stats.total > 0 ? Math.round((count / stats.total) * 100) : 0,
    }));

    return ok({
      total: stats.total,
      llmGenerated: stats.llmGenerated,
      humanGenerated: stats.total - stats.llmGenerated,
      llmPercentage,
      byTool: byToolEnriched,
      byState: stats.byState,
      repos,
    });
  } catch (error) {
    return handleError(error);
  }
}
