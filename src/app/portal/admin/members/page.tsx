import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/types/database";
import MemberManager from "./MemberManager";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: actor, error: actorError } = await supabase.from("members").select("*").eq("user_id", user.id).maybeSingle();
  if (actorError || !actor || actor.status !== "active") redirect("/portal/pending");
  if (!["leader", "executive"].includes(actor.role)) redirect("/portal");
  const { data, error } = await supabase.from("members").select("*").order("created_at", { ascending: false });
  return <main className="mx-auto min-h-[75vh] max-w-7xl px-5 py-14 sm:px-8">
    <Link href="/portal" className="text-sm font-bold text-slate-500 hover:text-violet-700">← ポータルへ</Link>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-widest text-violet-600">MEMBER MANAGEMENT</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">メンバー管理</h1><p className="mt-4 text-sm leading-6 text-slate-500">メンバーの登録状況と権限を管理します。</p></div></div>
    {error ? <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-white p-6 text-red-700">メンバー一覧を取得できませんでした。時間をおいて再度お試しください。</p> : <MemberManager members={(data ?? []) as Member[]} actor={actor as Member} />}
  </main>;
}
