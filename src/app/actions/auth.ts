"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { oauthProviderStatus } from "@/lib/supabase/provider-status";

async function origin() { const h = await headers(); const host = h.get("host"); if (!host) throw new Error("Host is missing"); return `${h.get("x-forwarded-proto") === "https" ? "https" : "http"}://${host}`; }
export async function oauth(provider: "google" | "discord") {
  if (provider !== "google" && provider !== "discord") redirect("/login?error=oauth");
  if (await oauthProviderStatus(provider) === "disabled") redirect(`/login?error=provider_disabled&provider=${provider}`);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${await origin()}/auth/callback` } });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}
export async function emailLogin(form: FormData) { const email = String(form.get("email") || "").trim(); const supabase = await createClient(); const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${await origin()}/auth/callback` } }); redirect(error ? "/login?error=email" : "/login?sent=1"); }
export async function confirmEmail(form: FormData) {
  const tokenHash = form.get("token_hash");
  if (typeof tokenHash !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(tokenHash)) redirect("/login?error=expired");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error || !data.session) redirect("/login?error=expired");
  revalidatePath("/", "layout");
  redirect("/portal");
}
export async function signOut() { const supabase = await createClient(); await supabase.auth.signOut(); redirect("/"); }
