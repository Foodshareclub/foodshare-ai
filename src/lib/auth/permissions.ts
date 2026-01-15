import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "member" | "viewer";

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: Role;
}

export async function getUserTeams() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("team_members")
    .select("team_id, role, teams(id, name, slug)")
    .eq("user_id", user.id);

  return data || [];
}

export async function getUserRole(teamId: string): Promise<Role | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .single();

  return data?.role || null;
}

export async function canManageRepo(repoFullName: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: repo } = await supabase
    .from("repo_configs")
    .select("team_id")
    .eq("full_name", repoFullName)
    .single();

  if (!repo?.team_id) return true; // No team = public

  const role = await getUserRole(repo.team_id);
  return role !== null && role !== "viewer";
}

export async function requireRole(teamId: string, minRole: Role): Promise<boolean> {
  const roleHierarchy: Record<Role, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
  const userRole = await getUserRole(teamId);
  if (!userRole) return false;
  return roleHierarchy[userRole] >= roleHierarchy[minRole];
}
