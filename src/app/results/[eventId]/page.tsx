import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { eventTypeLabels, formatEventDate, isUuid } from "@/lib/events";
import { parseIrRanking } from "@/lib/ir";
import { parseBingoRanking } from "@/lib/bingo";
import type { Event, IrSnapshot } from "@/types/database";
import IrRanking from "@/app/components/IrRanking";
import ShareButtons from "./ShareButtons";

const getPublishedEvent = cache(async (eventId: string) => {
  if (!isUuid(eventId)) return { event: null, error: false };
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").eq("id", eventId).eq("status", "published").maybeSingle();
  return { event: data as Event | null, error: !!error };
});
function siteBase() {
  try { const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : undefined; } catch { return undefined; }
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const { event } = await getPublishedEvent(eventId);
  if (!event) return { title: "イベント結果 | SRB" };
  const title = `${event.title} の結果発表 | SRB`;
  const description = (event.description || `${event.title}の最終結果を公開中。上智大学の音ゲー・ゲーム制作サークル SRB。`).slice(0, 160);
  return { metadataBase: siteBase(), title, description, alternates: { canonical: `/results/${eventId}` }, openGraph: { type: "article", title, description, url: `/results/${eventId}`, siteName: "SRB" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function EventResult({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const result = await getPublishedEvent(eventId);
  if (result.error) return <main className="mx-auto min-h-[70vh] max-w-4xl px-6 py-20"><p role="alert">イベント情報を読み込めませんでした。</p><Link className="mt-6 inline-block text-violet-700" href="/">トップへ戻る</Link></main>;
  if (!result.event) notFound();
  const event = result.event;
  const supabase = await createClient();
  const { data, error: snapshotError } = await supabase.from("ir_snapshots").select("*").eq("event_id", eventId).eq("is_final", true).lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).limit(1).maybeSingle();
  const snapshot = data as IrSnapshot | null;
  const ir = snapshot ? parseIrRanking(snapshot.rankings_data) : null;
  const bingo = snapshot ? parseBingoRanking(snapshot.rankings_data) : null;
  return <main><section className="overflow-hidden bg-slate-950 text-white"><div className="mx-auto max-w-6xl px-6 py-20 sm:py-28"><Link href="/" className="text-sm font-bold text-slate-400 hover:text-white">← SRB トップへ</Link><div className="mt-14 flex flex-wrap gap-2 text-xs font-bold tracking-wider"><span className="rounded-xl border border-violet-400 bg-violet-400 px-3 py-2 text-slate-950">{eventTypeLabels[event.event_type]}</span><span className="rounded-xl border border-slate-700 px-3 py-2 text-slate-300">FINAL RESULTS</span></div><p className="mt-8 text-xs font-bold tracking-[0.3em] text-violet-300">SRB EVENT RESULTS</p><h1 className="mt-4 max-w-4xl break-words text-4xl font-black leading-tight sm:text-6xl">{event.title}<span className="text-violet-300">.</span></h1><p className="mt-6 text-sm leading-7 text-slate-300">{formatEventDate(event.start_at)} 〜 {formatEventDate(event.end_at)}{event.location && <> / {event.location}</>}</p><div className="mt-8"><ShareButtons title={event.title} /></div></div><div className="border-t border-slate-800 px-6 py-4 text-center text-xs font-bold tracking-[0.35em] text-slate-500">PLAY / CREATE / SHARE</div></section>
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-16"><section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><p className="text-xs font-bold tracking-widest text-violet-600">ABOUT THIS EVENT</p><h2 className="mt-3 text-2xl font-black">イベントについて</h2><p className="mt-5 whitespace-pre-wrap text-sm leading-8 text-slate-600">{event.description || "SRBのイベントにご参加いただき、ありがとうございました。"}</p></section>
      {snapshotError && <p role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700">結果データを読み込めませんでした。時間をおいて再度お試しください。</p>}
      {!snapshotError && snapshot?.overall_commentary && <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6 sm:p-8"><p className="text-xs font-bold tracking-widest text-violet-700">HIGHLIGHTS</p><h2 className="mt-3 text-2xl font-black">大会総評</h2><p className="mt-4 whitespace-pre-wrap leading-8 text-slate-700">{snapshot.overall_commentary}</p></section>}
      {!snapshotError && event.event_type === "ir" && <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><p className="mb-3 text-xs font-bold tracking-widest text-violet-600">THE FINAL STANDINGS</p>{ir ? <IrRanking data={ir} /> : <p className="text-sm text-slate-500">公開されたランキングデータはありません。</p>}</section>}
      {!snapshotError && event.event_type === "bingo" && <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><p className="text-xs font-bold tracking-widest text-violet-600">MISSION BINGO</p><h2 className="mt-3 text-2xl font-black">達成ランキング</h2>{bingo?.standings.length ? <><div className="mt-6 grid gap-3 sm:grid-cols-3">{bingo.standings.filter((row) => row.rank <= 3).map((row) => <div key={row.memberId} className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><p className="text-xs font-bold tracking-widest text-violet-700">RANK {row.rank}</p><p className="mt-4 break-words text-lg font-black">{row.name}</p><p className="mt-2 text-sm text-slate-600">{row.lines} BINGO / {row.achieved} マス</p></div>)}</div><div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[420px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">順位</th><th className="p-3">プレイヤー</th><th className="p-3">BINGO</th><th className="p-3">達成マス</th></tr></thead><tbody>{bingo.standings.map((row) => <tr key={row.memberId} className="border-t border-slate-200"><td className="p-3 font-bold">{row.rank}</td><td className="p-3">{row.name}</td><td className="p-3">{row.lines}</td><td className="p-3">{row.achieved}</td></tr>)}</tbody></table></div></> : <p className="mt-4 text-sm text-slate-500">公開された達成ランキングはありません。</p>}</section>}
      {event.event_type === "free" && !snapshot?.overall_commentary && <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><p className="text-xs font-bold tracking-widest text-violet-600">HIGHLIGHTS</p><h2 className="mt-3 text-2xl font-black">イベントハイライト</h2><p className="mt-4 text-sm text-slate-500">ハイライトはまだ登録されていません。</p></section>}
      <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center"><p className="font-bold">一緒に、次の「好き」をつくろう。</p><Link href="/" className="mt-5 inline-block rounded-xl border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-bold text-white">SRB の活動を見る ↗</Link></div>
    </div></main>;
}
