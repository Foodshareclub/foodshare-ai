import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const ALLOWED_EMAIL = "tamerlanium@gmail.com";

export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || user.email !== ALLOWED_EMAIL) {
    redirect("/login");
  }
  
  return user;
}

export async function isAuthorized(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === ALLOWED_EMAIL;
}
