import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, err, handleError } from "@/lib/api";
import { syncRepoPRs } from "@/lib/pr-store";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("repo_configs").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return ok({ configs: data });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { full_name, enabled = true, auto_review = true, categories, ignore_paths, custom_instructions, skip_initial_sync = false } = await request.json();
    if (!full_name?.includes("/")) return err("Invalid repo format (expected owner/repo)");

    const supabase = await createClient();

    // Check if this is a new config (not just an update)
    const { data: existing } = await supabase
      .from("repo_configs")
      .select("id, enabled")
      .eq("full_name", full_name)
      .single();

    const isNewOrNewlyEnabled = !existing || (!existing.enabled && enabled);

    const { data, error } = await supabase
      .from("repo_configs")
      .upsert({ full_name, enabled, auto_review, categories: categories || ["security", "bug", "performance"], ignore_paths, custom_instructions, updated_at: new Date().toISOString() }, { onConflict: "full_name" })
      .select()
      .single();

    if (error) throw error;

    // Trigger initial PR sync for newly enabled repos
    let syncResult = null;
    if (enabled && isNewOrNewlyEnabled && !skip_initial_sync) {
      const [owner, repo] = full_name.split("/");
      try {
        syncResult = await syncRepoPRs(owner, repo, "open");
      } catch (syncError) {
        console.error(`Initial sync failed for ${full_name}:`, syncError);
        // Don't fail the config save, just log the error
      }
    }

    return ok({
      config: data,
      initialSync: syncResult ? {
        synced: syncResult.synced,
        errors: syncResult.errors.length > 0 ? syncResult.errors : undefined,
      } : undefined,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const full_name = new URL(request.url).searchParams.get("full_name");
    if (!full_name) return err("full_name required");

    const supabase = await createClient();
    const { error } = await supabase.from("repo_configs").delete().eq("full_name", full_name);
    if (error) throw error;
    return ok({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
