import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAllPages } from "@/lib/supabase/read-all";
import { getBingoResults, getIrLogs } from "@/lib/results-server";
import { parseBingoConfig } from "@/lib/bingo";
import { parseIrSongs, type IrLog } from "@/lib/ir";
import { isUuid } from "@/lib/events";
import type { Event, EventAttendance, IrSnapshot, IrSubmission } from "@/types/database";
import EventCard from "../../EventCard";
import BingoBoard from "./BingoBoard";
import IrPanel from "./IrPanel";
import FreeResultAdmin from "./FreeResultAdmin";

export default async function EventDetail({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!isUuid(eventId)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase.from("members").select("id,status,role").eq("user_id", user.id).maybeSingle();
  if (!member || member.status !== "active") redirect("/portal/pending");
  const [eventResult, attendanceResult] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).in("status", ["approved", "published"]).maybeSingle(),
    supabase.from("event_attendances").select("*").eq("event_id", eventId).eq("member_id", member.id).maybeSingle(),
  ]);
  if (eventResult.error || attendanceResult.error) return <main className="mx-auto min-h-[70vh] max-w-5xl px-6 py-20"><p role="alert">イベント情報を取得できませんでした。</p><Link href="/portal" className="mt-6 inline-block text-violet-700">一覧へ戻る</Link></main>;
  if (!eventResult.data) notFound();
  const event = eventResult.data as Event;
  const canManage = member.role === "leader" || member.role === "executive";
  const bingoConfig = parseBingoConfig(event.config);
  const songs = parseIrSongs(event.config);
  let bingoData: Awaited<ReturnType<typeof getBingoResults>> | null = null;
  let bingoHasFinal = false;
  let freeHasFinal = false;
  let irData: { mine: IrSubmission[]; snapshots: IrSnapshot[]; logs: IrLog[] | null } | null = null;
  let loadError = "";
  try {
    if (event.event_type === "free" && canManage) {
      const { count, error } = await supabase.from("ir_snapshots").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("is_final", true);
      if (error || count === null) throw new Error("公開結果の状態を取得できませんでした。");
      freeHasFinal = count > 0;
    }
    if (event.event_type === "bingo") {
      if (!bingoConfig) throw new Error("ビンゴ設定を確認してください。");
      bingoData = await getBingoResults(supabase, eventId, bingoConfig);
      if (canManage) {
        const { count, error } = await supabase.from("ir_snapshots").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("is_final", true);
        if (error || count === null) throw new Error("最終発表の状態を取得できませんでした。");
        bingoHasFinal = count > 0;
      }
    }
    if (event.event_type === "ir") {
      if (!songs) throw new Error("課題曲の設定を確認してください。");
      const [mine, snapshots, admin] = await Promise.all([
        readAllPages<IrSubmission>((from, to) => supabase.from("ir_submissions").select("*", { count: "exact" }).eq("event_id", eventId).eq("member_id", member.id).order("submitted_at", { ascending: false }).order("id").range(from, to)),
        readAllPages<IrSnapshot>((from, to) => supabase.from("ir_snapshots").select("*", { count: "exact" }).eq("event_id", eventId).lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).order("id").range(from, to)),
        canManage ? getIrLogs(supabase, eventId) : Promise.resolve(null),
      ]);
      const names = new Map(admin?.members.map((m) => [m.id, m.display_name]) ?? []);
      const logs: IrLog[] | null = admin ? admin.submissions.map((row) => ({ ...row, member_name: names.get(row.member_id) ?? "不明" })).sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at)) : null;
      irData = { mine, snapshots, logs };
    }
  } catch (error) {
    bingoData = null;
    irData = null;
    loadError = error instanceof Error ? error.message : "イベントのデータを取得できませんでした。";
  }
  return <main className="mx-auto min-h-[75vh] max-w-5xl px-5 py-14 sm:px-8"><Link href="/portal" className="text-sm font-bold text-slate-500 hover:text-violet-700">← イベント一覧</Link><div className="mt-8 grid gap-6 md:grid-cols-2"><EventCard key={event.id} event={event} attendance={(attendanceResult.data as EventAttendance | null) ?? null} /><section className="rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-xl font-bold">イベントの詳細</h1><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{event.description || "詳細はまだありません。"}</p>{event.status === "published" && <Link href={`/results/${event.id}`} className="mt-5 inline-block rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-violet-700">公開結果を見る ↗</Link>}</section></div>{loadError && <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-700">{loadError}</p>}{!loadError && event.event_type === "free" && canManage && <FreeResultAdmin key={event.id} eventId={eventId} hasFinal={freeHasFinal} />}{bingoData && bingoConfig && <BingoBoard key={event.id} eventId={eventId} config={bingoConfig} mine={bingoData.submissions.filter((row) => row.member_id === member.id)} standings={bingoData.standings} canManage={canManage} published={event.status === "published"} hasFinal={bingoHasFinal} />}{irData && songs && <IrPanel key={event.id} eventId={eventId} songs={songs} mine={irData.mine} snapshots={irData.snapshots} adminLogs={irData.logs} published={event.status === "published"} />}</main>;
}
