import { NextRequest } from "next/server";
import { ok, err, handleError } from "@/lib/api";
import { syncRepoPRs } from "@/lib/pr-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, state = "all" } = body;

    if (!owner || !repo) {
      return err("Missing required params: owner, repo");
    }

    const result = await syncRepoPRs(owner, repo, state);

    return ok({
      message: `Synced ${result.synced} PRs from ${owner}/${repo}`,
      synced: result.synced,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    return handleError(error);
  }
}
