import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, err, handleError } from "@/lib/api";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { action, ...body } = await request.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (action === "register-options") {
      if (!user) return err("Unauthorized - please login first", 401);
      const challenge = crypto.randomBytes(32).toString("base64url");
      const credUserId = crypto.randomBytes(16).toString("base64url");

      await supabase.from("passkey_challenges").upsert({
        userId: user.id,
        challenge,
        type: "registration",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }, { onConflict: "userId" });

      return ok({
        challenge,
        rp: { name: "FoodShare AI", id: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").hostname },
        user: { id: credUserId, name: user.email, displayName: user.email?.split("@")[0] },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        timeout: 300000,
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "preferred" },
        attestation: "none",
      });
    }

    if (action === "register-verify") {
      if (!user) return err("Unauthorized", 401);
      const { credential } = body;

      await supabase.from("passkeys").insert({
        supabaseUserId: user.id,
        credentialId: credential.id,
        publicKey: credential.response?.publicKey || credential.id,
        counter: 0,
        deviceType: "platform",
        backedUp: false,
        transports: credential.response?.transports || [],
        name: body.deviceName || "Fingerprint",
      });

      await supabase.from("passkey_challenges").delete().eq("userId", user.id);
      return ok({ success: true });
    }

    if (action === "auth-options") {
      const challenge = crypto.randomBytes(32).toString("base64url");
      const email = body.email?.toLowerCase();
      if (!email) return err("Email required");

      // Get passkeys for this email by checking existing passkeys with matching user
      const { data: passkeys } = await supabase
        .from("passkeys")
        .select("credentialId, supabaseUserId")
        .order("createdAt", { ascending: false });

      // We need to verify the email matches - store challenge with email for verification
      const challengeId = crypto.randomUUID();
      await supabase.from("passkey_challenges").insert({
        id: challengeId,
        userId: email, // Store email temporarily
        challenge,
        type: "authentication",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      });

      if (!passkeys?.length) return err("No passkeys registered. Login with magic link first, then add a passkey in Settings.");

      return ok({
        challenge,
        challengeId,
        rpId: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").hostname,
        allowCredentials: passkeys.map(p => ({ id: p.credentialId, type: "public-key", transports: ["internal"] })),
        timeout: 300000,
        userVerification: "preferred",
      });
    }

    if (action === "auth-verify") {
      const { credential, email, challengeId } = body;

      // Verify challenge exists
      const { data: challengeData } = await supabase
        .from("passkey_challenges")
        .select("*")
        .eq("id", challengeId)
        .single();

      if (!challengeData) return err("Challenge expired or invalid");

      // Find passkey
      const { data: passkey } = await supabase
        .from("passkeys")
        .select("*")
        .eq("credentialId", credential.id)
        .single();

      if (!passkey) return err("Passkey not found");

      // Update counter
      await supabase.from("passkeys").update({ counter: (passkey.counter || 0) + 1 }).eq("id", passkey.id);
      
      // Clean up challenge
      await supabase.from("passkey_challenges").delete().eq("id", challengeId);

      // Send magic link to complete auth
      const { error: authError } = await supabase.auth.signInWithOtp({ 
        email, 
        options: { shouldCreateUser: false } 
      });
      
      if (authError) return err("Failed to send login link");
      return ok({ success: true, message: "Check your email for login link" });
    }

    return err("Invalid action");
  } catch (error) {
    return handleError(error);
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ok({ passkeys: [] }); // Return empty if not logged in

    const { data: passkeys } = await supabase
      .from("passkeys")
      .select("id, name, createdAt")
      .eq("supabaseUserId", user.id)
      .order("createdAt", { ascending: false });

    return ok({ passkeys: (passkeys || []).map(p => ({ id: p.id, device_name: p.name, created_at: p.createdAt, last_used_at: null })) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return err("Passkey ID required");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("Unauthorized", 401);

    await supabase.from("passkeys").delete().eq("id", id).eq("supabaseUserId", user.id);
    return ok({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
