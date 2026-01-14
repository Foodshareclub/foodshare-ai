import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

serve(async (req) => {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Recover stale jobs (processing > 10 min)
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase
    .from("review_jobs")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("started_at", staleThreshold);

  // Check for pending jobs
  const { count } = await supabase
    .from("review_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (!count || count === 0) {
    return new Response(JSON.stringify({ message: "No pending jobs" }));
  }

  // Trigger Next.js worker to process
  const res = await fetch(`${APP_URL}/api/worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  const result = await res.json();
  return new Response(JSON.stringify({ pending: count, worker: result }));
});
