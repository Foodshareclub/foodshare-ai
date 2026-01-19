import { NextRequest } from "next/server";
import { ok, err, handleError, v, validate } from "@/lib/api";
import { pr } from "@/lib/github";
import { upsertPullRequest, type GitHubPullRequest } from "@/lib/pr-store";

const MergeSchema = v.object({
  owner: v.string().min(1),
  repo: v.string().min(1),
  pr_number: v.number().int().positive(),
  merge_method: v.enum(["merge", "squash", "rebase"]).optional().default("squash"),
  commit_title: v.string().optional(),
  commit_message: v.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, pr_number, merge_method, commit_title, commit_message } = validate(MergeSchema, body);

    // Merge the PR via GitHub API
    const result = await pr.merge(owner, repo, pr_number, {
      merge_method,
      commit_title,
      commit_message,
    });

    // Fetch updated PR data and sync to database
    const repoFullName = `${owner}/${repo}`;
    try {
      const updatedPR = await pr.get(owner, repo, pr_number) as GitHubPullRequest;
      await upsertPullRequest({ pr: updatedPR, repoFullName });
    } catch {
      // Sync failure shouldn't fail the merge response
    }

    return ok({
      message: result.message || "Pull request merged successfully",
      sha: result.sha,
      merged: result.merged,
    });
  } catch (error) {
    // Map GitHub error codes to user-friendly messages
    if (error instanceof Error && error.message.includes("405")) {
      return err("PR cannot be merged (conflicts or branch protection rules)", 405);
    }
    if (error instanceof Error && error.message.includes("409")) {
      return err("Branch was modified after review - refresh and try again", 409);
    }
    if (error instanceof Error && error.message.includes("422")) {
      return err("PR is already merged or closed", 422);
    }
    return handleError(error);
  }
}
