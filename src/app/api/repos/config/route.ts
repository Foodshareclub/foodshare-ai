import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("repo_configs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configs: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { full_name } = body;

  if (!full_name?.includes("/")) {
    return NextResponse.json({ error: "Invalid repo format" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("repo_configs")
    .insert({
      full_name,
      enabled: true,
      auto_review: true,
      categories: ["security", "bug", "performance", "best_practices"],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}
