import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, handleError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const repo = searchParams.get("repo");

    const supabase = await createClient();
    let query = supabase.from("security_scans").select("*").order("created_at", { ascending: false }).limit(limit);
    if (repo) query = query.eq("repo_full_name", repo);

    const { data, error } = await query;
    if (error) throw error;
    return ok({ scans: data });
  } catch (error) {
    return handleError(error);
  }
}
