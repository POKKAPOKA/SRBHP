"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import Papa from "papaparse";
import { createIrSnapshot, submitIrResult } from "@/app/actions/ir";
import IrRanking from "@/app/components/IrRanking";
import { formatEventDate } from "@/lib/events";
import { parseIrRanking, type IrLog, type IrSong } from "@/lib/ir";
import { proofUrl } from "@/lib/proof-url";
import type { IrSnapshot, IrSubmission } from "@/types/database";

const button = "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-50";
const primary = "rounded-xl border border-violet-700 bg-violet-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50";

function downloadLogs(logs: IrLog[]) {
  const fields = ["提出日時", "部員名", "機種", "曲名", "難易度", "スコア", "判定内訳", "AI実況", "画像URL"];
  const data = logs.map((row) => [row.submitted_at, row.member_name, row.game_title, row.song_title, row.difficulty, row.score, JSON.stringify(row.judge_breakdown), row.ai_commentary, row.proof_image_url]);
  const csv = Papa.unparse({ fields, data }, { escapeFormulae: true });
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "srb-ir-submissions.csv"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export default function IrPanel({ eventId, songs, mine, snapshots, adminLogs, published }: { eventId: string; songs: IrSong[]; mine: IrSubmission[]; snapshots: IrSnapshot[]; adminLogs: IrLog[] | null; published: boolean }) {
  const [tab, setTab] = useState("mine");
  const selected = snapshots.find((snapshot) => snapshot.id === tab);
  const ranking = selected ? parseIrRanking(selected.rankings_data) : null;
  const [state, submit, pending] = useActionState(submitIrResult, null);
  return <section className="mt-8 space-y-5"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-none sm:p-7"><p className="text-xs font-bold tracking-widest text-violet-600">INTERNET RANKING</p><h2 className="mt-2 text-2xl font-black">自動集計 IR</h2><p className="mt-3 text-sm leading-6 text-slate-500">リザルト画像を提出すると、AIが課題曲とスコアを読み取ります。全体順位は役員が公開した発表で確認できます。</p><div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-bold">課題曲</h3><ul className="mt-2 space-y-1 text-sm text-slate-600">{songs.map((song, index) => <li key={`${song.game_title}-${song.song_title}-${song.difficulty}-${index}`}>{song.game_title} / {song.song_title} / {song.difficulty}</li>)}</ul></div>
    {state && <p role={state.ok ? "status" : "alert"} className={`mt-4 rounded-xl border p-3 text-sm ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{state.message}</p>}
    {!published ? <form action={submit} className="mt-5 space-y-3"><input type="hidden" name="eventId" value={eventId} /><label className="block space-y-1 text-sm font-bold">リザルト画像（JPEG・PNG・WebP／4MB以下）<input type="file" name="proof" accept="image/jpeg,image/png,image/webp" required disabled={pending} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal" /></label><p className="text-xs leading-5 text-slate-500">画像は解析のため Gemini に送信され、公開バケットに保存されます。読み取り後は提出履歴で内容をご確認ください。</p><button disabled={pending} className={primary}>{pending ? "解析・提出中…" : "画像を解析して提出"}</button></form> : <p className="mt-5 text-sm text-slate-500">最終結果の公開後は新しい提出を受け付けません。</p>}
  </div>
  <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><div role="tablist" aria-label="IRの提出履歴と発表" className="flex flex-wrap gap-2"><button role="tab" aria-selected={!selected} className={`${button} ${!selected ? "border-violet-500 text-violet-700" : ""}`} onClick={() => setTab("mine")}>自分の提出履歴</button>{snapshots.map((snapshot) => <button key={snapshot.id} role="tab" aria-selected={selected?.id === snapshot.id} className={`${button} ${selected?.id === snapshot.id ? "border-violet-500 text-violet-700" : ""}`} onClick={() => setTab(snapshot.id)}>{snapshot.title}</button>)}</div>
    {!selected ? <div role="tabpanel" className="mt-6 space-y-4">{!mine.length && <p className="text-sm text-slate-500">提出履歴はまだありません。</p>}{mine.map((row) => { const url = proofUrl(row.proof_image_url); return <article key={row.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold text-violet-700">{row.game_title} / {row.difficulty}</p><h3 className="mt-1 text-lg font-bold">{row.song_title}</h3><p className="mt-2 text-xl font-black tabular-nums">{row.score.toLocaleString()}</p></div><span className="text-xs text-slate-500">{formatEventDate(row.submitted_at)}</span></div><p className="mt-3 text-sm leading-6 text-slate-600">{row.ai_commentary}</p><p className="mt-2 text-xs leading-5 text-slate-500">判定：{Object.entries(row.judge_breakdown).map(([key, value]) => `${key} ${value}`).join(" / ") || "なし"}</p>{url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 block w-fit"><Image src={url} alt={`${row.song_title}の提出画像`} width={320} height={180} unoptimized className="max-h-48 w-auto rounded-xl border border-slate-200 object-contain" /><span className="mt-1 block text-xs font-bold text-violet-700">証跡画像を開く ↗</span></a>}</article>; })}</div> : <div role="tabpanel" className="mt-6"><h3 className="text-xl font-bold">{selected.title}</h3><p className="mt-1 text-xs text-slate-500">{formatEventDate(selected.published_at)} 公開</p>{selected.overall_commentary && <p className="my-5 whitespace-pre-wrap rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-7 text-violet-900">{selected.overall_commentary}</p>}<div className="mt-5">{ranking ? <IrRanking data={ranking} /> : <p className="text-sm text-slate-500">この発表のランキング形式を表示できません。</p>}</div></div>}
  </div>{adminLogs !== null && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-widest text-violet-600">FOR OFFICERS</p><h3 className="mt-2 text-xl font-bold">IR 管理</h3><p className="mt-2 text-xs leading-5 text-slate-500">スナップショットには作成時点の自己ベストを保存します。最終公開後はアプリから新規提出できません。</p></div><button type="button" className={button} disabled={!adminLogs.length} onClick={() => downloadLogs(adminLogs)}>全提出ログをCSV出力 ↓</button></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><SnapshotForm key="intermediate" eventId={eventId} mode="intermediate" disabled={published} /><SnapshotForm key="final" eventId={eventId} mode="final" disabled={snapshots.some((snapshot) => snapshot.is_final)} /></div></section>}
  </section>;
}

function SnapshotForm({ eventId, mode, disabled }: { eventId: string; mode: "intermediate" | "final"; disabled: boolean }) {
  const [state, action, pending] = useActionState(createIrSnapshot, null);
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-bold">{mode === "final" ? "最終結果を一般公開" : "中間発表を公開"}</h4><p className="mt-2 text-xs leading-5 text-slate-500">{mode === "final" ? "スナップショットを保存し、イベント結果を一般公開します。" : "現在の自己ベストを集計して部員に公開します。"}</p>{state && <p role={state.ok ? "status" : "alert"} className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}{!disabled && <form action={action} className="mt-4 space-y-3"><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="mode" value={mode} />{mode === "final" ? <label className="block space-y-1 text-sm font-bold">大会総評<textarea name="commentary" required maxLength={3000} rows={4} className="w-full rounded-xl border border-slate-200 bg-white p-3 font-normal" /></label> : <input type="hidden" name="commentary" value="" />}<button disabled={pending} className={mode === "final" ? primary : button}>{pending ? "処理中…" : mode === "final" ? "最終結果を発表して一般公開" : "中間発表を作成して公開"}</button></form>}</div>;
}
