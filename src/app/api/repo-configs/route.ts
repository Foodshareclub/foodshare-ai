import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repo_configs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { 
    full_name, 
    enabled = true, 
    auto_review = true, 
    categories,
    ignore_paths = [],
    custom_instructions = ""
  } = body;

  if (!full_name) {
    return NextResponse.json({ error: "full_name required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repo_configs")
    .upsert({ 
      full_name, 
      enabled, 
      auto_review, 
      categories, 
      ignore_paths,
      custom_instructions,
      updated_at: new Date().toISOString() 
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const full_name = searchParams.get("full_name");

  if (!full_name) {
    return NextResponse.json({ error: "full_name required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("repo_configs").delete().eq("full_name", full_name);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
