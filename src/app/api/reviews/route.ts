import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, handleError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const repo = searchParams.get("repo");
    const pr = searchParams.get("pr");

    const supabase = await createClient();
    let query = supabase.from("review_history").select("*").order("created_at", { ascending: false }).limit(limit);
    if (repo) query = query.eq("repo_full_name", repo);
    if (pr) query = query.eq("pr_number", parseInt(pr));

    const { data, error } = await query;
    if (error) throw error;
    return ok({ reviews: data });
  } catch (error) {
    return handleError(error);
  }
}
