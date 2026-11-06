import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll(values) { values.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  const { data: { user } } = await supabase.auth.getUser();
  let destination: string | null = null;
  if (!user) destination = "/login";
  else { const { data: member } = await supabase.from("members").select("status").eq("user_id", user.id).maybeSingle(); if (member?.status !== "active" && request.nextUrl.pathname !== "/portal/pending") destination = "/portal/pending"; if (member?.status === "active" && request.nextUrl.pathname === "/portal/pending") destination = "/portal"; }
  if (!destination) return response;
  const redirect = NextResponse.redirect(new URL(destination, request.url)); response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie)); return redirect;
}
