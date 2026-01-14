import { createClient } from "@/lib/supabase/server";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const supabase = await createClient();
    const [reviews, repos] = await Promise.all([
      supabase.from("review_history").select("id", { count: "exact" }),
      supabase.from("repo_configs").select("id", { count: "exact" }),
    ]);
    return ok({ reviews: reviews.count || 0, repos: repos.count || 0 });
  } catch (error) {
    return handleError(error);
  }
}
