import { NextRequest } from "next/server";
import { pr } from "@/lib/github";
import { ok, err, handleError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const state = (searchParams.get("state") || "open") as "open" | "closed" | "all";

    if (!owner || !repo) return err("Missing required params: owner, repo");

    const data = await pr.list(owner, repo, state);
    const pulls = data.map((p: any) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      user: p.user?.login,
      created_at: p.created_at,
      url: p.html_url,
    }));
    
    return ok({ pulls });
  } catch (error) {
    return handleError(error);
  }
}
