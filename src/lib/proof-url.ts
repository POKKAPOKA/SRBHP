export function proofUrl(value: string | null | undefined): string | null {
  if (!value || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const url = new URL(value);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return url.origin === base.origin && url.pathname.startsWith("/storage/v1/object/public/proofs/") && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
