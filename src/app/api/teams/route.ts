import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, err, handleError } from "@/lib/api";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("Unauthorized", 401);

    const { data } = await supabase
      .from("team_members")
      .select("role, teams(id, name, slug)")
      .eq("user_id", user.id);

    return ok({ teams: data?.map(d => ({ ...d.teams, role: d.role })) || [] });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("Unauthorized", 401);

    const { name } = await request.json();
    if (!name) return err("Team name required");

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({ name, slug })
      .select()
      .single();

    if (teamError) throw teamError;

    await supabase.from("team_members").insert({
      team_id: team.id,
      user_id: user.id,
      role: "owner",
    });

    return ok({ team });
  } catch (error) {
    return handleError(error);
  }
}
