import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, handleError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const repo = searchParams.get("repo");

    const supabase = await createClient();
    let query = supabase.from("security_scans").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (repo) query = query.eq("repo_full_name", repo);

    const { data, error, count } = await query;
    if (error) throw error;

    const { data: repoData } = await supabase.from("security_scans").select("repo_full_name");
    const uniqueRepos = new Set(repoData?.map(r => r.repo_full_name)).size;

    return ok({ scans: data, total: count, totalRepos: uniqueRepos });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repo = searchParams.get("repo");
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cronSecret = process.env.CRON_SECRET;
    
    if (!supabaseUrl || !cronSecret) {
      throw new Error("Missing configuration");
    }
    
    const url = repo 
      ? `${supabaseUrl}/functions/v1/scan-repos?repo=${repo}`
      : `${supabaseUrl}/functions/v1/scan-repos`;
      
    await fetch(url, { 
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` } 
    });
    
    return ok({ message: "Scan triggered" });
  } catch (error) {
    return handleError(error);
  }
}
