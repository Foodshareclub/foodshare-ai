import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo");

  const supabase = await createClient();
  let query = supabase.from("review_learnings").select("*").order("created_at", { ascending: false });

  if (repo) query = query.eq("repo_full_name", repo);

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { repo_full_name, pattern, learning, category } = await request.json();

  if (!repo_full_name || !pattern || !learning) {
    return NextResponse.json({ error: "repo_full_name, pattern, learning required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("review_learnings")
    .insert({ repo_full_name, pattern, learning, category })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("review_learnings").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
