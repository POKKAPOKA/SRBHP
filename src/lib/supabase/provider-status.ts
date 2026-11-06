import "server-only";

export type OAuthProvider = "google" | "discord";
export type ProviderStatus = "enabled" | "disabled" | "unknown";

// Auth's public settings endpoint reports availability without exposing credentials.
// A transient lookup failure must not prevent an otherwise valid OAuth flow.
export async function oauthProviderStatus(provider: OAuthProvider): Promise<ProviderStatus> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return "unknown";
  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "unknown";
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("external" in data) || !data.external || typeof data.external !== "object") return "unknown";
    const enabled = (data.external as Record<string, unknown>)[provider];
    return enabled === true ? "enabled" : enabled === false ? "disabled" : "unknown";
  } catch { return "unknown"; }
}
