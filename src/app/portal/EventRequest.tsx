"use client";

import { useRef, useState, useTransition } from "react";
import { createEvent } from "@/app/actions/events";
import type { ActionResult, EventType } from "@/types/database";

const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal";
const secondary = "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-50";
type Song = { game_title: string; song_title: string; difficulty: string };
const emptySong = (): Song => ({ game_title: "", song_title: "", difficulty: "" });

export default function EventRequest() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); };
  return <>{notice && <div role={notice.ok ? "status" : "alert"} className={`fixed bottom-24 right-5 z-30 max-w-sm rounded-xl border bg-white p-4 text-sm ${notice.ok ? "border-emerald-300 text-emerald-800" : "border-red-300 text-red-800"}`}>{notice.message}</div>}
    <button ref={triggerRef} type="button" aria-label="イベントを企画する" onClick={() => { setNotice(null); setOpen(true); }} className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-700 bg-violet-700 text-3xl font-normal text-white shadow-none hover:bg-violet-800">＋</button>
    {open && <EventRequestForm key="new-event" onClose={close} onSuccess={(result) => { setNotice(result); close(); }} />}
  </>;
}

function EventRequestForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: (result: ActionResult) => void }) {
  const [type, setType] = useState<EventType>("free");
  const [size, setSize] = useState<3 | 5>(3);
  const [missions, setMissions] = useState<string[]>(Array(25).fill(""));
  const [songs, setSongs] = useState<Song[]>([emptySong()]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" onKeyDown={(e) => {
    if (e.key === "Escape" && !pending) onClose();
    if (e.key === "Tab") {
      const targets = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])');
      const first = targets[0], last = targets[targets.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}><div role="dialog" aria-modal="true" aria-labelledby="event-request-title" className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-none sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-widest text-violet-600">NEW EVENT</p><h2 id="event-request-title" className="mt-2 text-2xl font-black">イベントを企画する</h2><p className="mt-2 text-sm text-slate-500">申請後、役員の承認を経てイベント一覧に表示されます。</p></div><button type="button" aria-label="閉じる" className={secondary} disabled={pending} onClick={onClose}>×</button></div>
    <form className="mt-6 space-y-5" onSubmit={(e) => {
      e.preventDefault(); setError("");
      const data = new FormData(e.currentTarget);
      const value = (key: string) => String(data.get(key) ?? "");
      let start: string, end: string;
      try { start = new Date(`${value("start_at")}:00+09:00`).toISOString(); end = new Date(`${value("end_at")}:00+09:00`).toISOString(); }
      catch { setError("日時を確認してください。"); return; }
      const config = type === "bingo" ? { size, missions: missions.slice(0, size * size) } : type === "ir" ? { songs, intermediate_interval_hours: Number(value("interval")) } : {};
      startTransition(async () => { try { const result = await createEvent({ title: value("title"), description: value("description"), location: value("location"), start_at: start, end_at: end, event_type: type, config }); if (result.ok) onSuccess(result); else setError(result.message); } catch { setError("通信に失敗しました。登録状況を確認してください。"); } });
    }}>
      <label className="block space-y-1 text-sm font-bold">イベント名<input autoFocus className={field} name="title" required maxLength={120} /></label>
      <label className="block space-y-1 text-sm font-bold">概要<textarea className={field} name="description" rows={3} maxLength={3000} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-bold">開始日時（日本時間）<input className={field} name="start_at" type="datetime-local" required /></label><label className="space-y-1 text-sm font-bold">終了日時（日本時間）<input className={field} name="end_at" type="datetime-local" required /></label></div>
      <label className="block space-y-1 text-sm font-bold">場所<input className={field} name="location" maxLength={200} /></label>
      <label className="block space-y-1 text-sm font-bold">イベント種別<select className={field} value={type} onChange={(e) => setType(e.target.value as EventType)}><option value="free">自由企画</option><option value="bingo">ミッションビンゴ</option><option value="ir">自動集計IR</option></select></label>
      {type === "bingo" && <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><legend className="px-1 text-sm font-bold">ビンゴの設定</legend><label className="block space-y-1 text-sm font-bold">サイズ<select value={size} onChange={(e) => setSize(Number(e.target.value) as 3 | 5)} className={field}><option value={3}>3 × 3</option><option value={5}>5 × 5</option></select></label><div className="grid gap-3 sm:grid-cols-2">{missions.slice(0, size * size).map((mission, index) => <label key={index} className="space-y-1 text-xs font-bold">マス {index + 1}<input className={field} value={mission} maxLength={200} required onChange={(e) => { const next = [...missions]; next[index] = e.target.value; setMissions(next); }} /></label>)}</div></fieldset>}
      {type === "ir" && <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><legend className="px-1 text-sm font-bold">IR の設定</legend><p className="text-xs text-slate-500">課題曲を1曲以上追加してください。</p>{songs.map((song, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><label className="space-y-1 text-xs font-bold">機種<input className={field} required maxLength={100} value={song.game_title} onChange={(e) => setSongs(songs.map((s, i) => i === index ? { ...s, game_title: e.target.value } : s))} /></label><label className="space-y-1 text-xs font-bold">曲名<input className={field} required maxLength={200} value={song.song_title} onChange={(e) => setSongs(songs.map((s, i) => i === index ? { ...s, song_title: e.target.value } : s))} /></label><label className="space-y-1 text-xs font-bold">難易度<input className={field} required maxLength={100} value={song.difficulty} onChange={(e) => setSongs(songs.map((s, i) => i === index ? { ...s, difficulty: e.target.value } : s))} /></label><button type="button" className={`${secondary} self-end`} disabled={songs.length === 1} onClick={() => setSongs(songs.filter((_, i) => i !== index))}>削除</button></div>)}<button type="button" className={secondary} disabled={songs.length >= 30} onClick={() => setSongs([...songs, emptySong()])}>＋ 課題曲を追加</button><label className="block space-y-1 text-sm font-bold">中間発表間隔（時間）<input className={field} type="number" name="interval" min="1" max="720" defaultValue="24" required /></label></fieldset>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5"><button type="button" className={secondary} disabled={pending} onClick={onClose}>キャンセル</button><button disabled={pending} className="rounded-xl border border-violet-700 bg-violet-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending ? "申請中…" : "企画を申請"}</button></div>
    </form>
  </div></div>;
}
