import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, err, handleError } from "@/lib/api";
import { requireRole } from "@/lib/auth/permissions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data } = await supabase
      .from("team_members")
      .select("user_id, role, created_at")
      .eq("team_id", id);

    return ok({ members: data || [] });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!await requireRole(id, "admin")) return err("Forbidden", 403);

    const { email, role = "member" } = await request.json();
    if (!email) return err("Email required");

    const supabase = await createClient();

    // Find user by email
    const { data: users } = await supabase.auth.admin.listUsers();
    const targetUser = users?.users?.find(u => u.email === email);
    if (!targetUser) return err("User not found");

    const { error } = await supabase.from("team_members").upsert({
      team_id: id,
      user_id: targetUser.id,
      role,
    });

    if (error) throw error;
    return ok({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!await requireRole(id, "admin")) return err("Forbidden", 403);

    const { user_id } = await request.json();
    if (!user_id) return err("user_id required");

    const supabase = await createClient();
    await supabase.from("team_members").delete().eq("team_id", id).eq("user_id", user_id);

    return ok({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
