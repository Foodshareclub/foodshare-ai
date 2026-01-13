import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "20");
  const repo = searchParams.get("repo");
  const pr = searchParams.get("pr");

  const supabase = await createClient();
  
  let query = supabase
    .from("review_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (repo) {
    query = query.eq("repo_full_name", repo);
  }
  if (pr) {
    query = query.eq("pr_number", parseInt(pr));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reviews: data });
}
