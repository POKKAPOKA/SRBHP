"use client";

import { useState } from "react";
import { eventTypeLabels, formatEventDate } from "@/lib/events";
import type { ActionResult, Event } from "@/types/database";
import { EventDecision } from "./AdminControls";

export default function PendingEvents({ events }: { events: Event[] }) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-none sm:p-7"><div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-bold">承認待ちの企画</h2><span className="text-sm text-slate-500">{events.length}件</span></div>
    {message && <p role={message.ok ? "status" : "alert"} className={`mt-4 rounded-xl border p-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.message}</p>}
    {events.length === 0 ? <p className="mt-5 text-sm text-slate-500">承認待ちの企画はありません。</p> : <div className="mt-3 divide-y divide-slate-200">{events.map((event) => {
      const config = event.config && typeof event.config === "object" && !Array.isArray(event.config) ? event.config : {};
      const missions = Array.isArray(config.missions) ? config.missions.filter((v): v is string => typeof v === "string") : [];
      const songs = Array.isArray(config.songs) ? config.songs : [];
      return <article key={event.id} className="grid gap-4 py-5 md:grid-cols-[1fr_auto]"><div><p className="text-xs font-bold text-violet-700">{eventTypeLabels[event.event_type]}</p><h3 className="mt-1 text-lg font-bold">{event.title}</h3><p className="mt-2 text-sm text-slate-500">{formatEventDate(event.start_at)} 〜 {formatEventDate(event.end_at)} / {event.location || "場所未定"}</p>{event.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.description}</p>}
        {missions.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold text-violet-700">ミッションを見る（{missions.length}マス）</summary><ol className="mt-2 list-inside list-decimal space-y-1 text-slate-600">{missions.map((mission, i) => <li key={i}>{mission}</li>)}</ol></details>}
        {songs.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold text-violet-700">課題曲を見る（{songs.length}曲）</summary><ul className="mt-2 space-y-1 text-slate-600">{songs.map((value, i) => { const song = value && typeof value === "object" && !Array.isArray(value) ? value : {}; return <li key={i}>{typeof song.game_title === "string" ? song.game_title : ""} / {typeof song.song_title === "string" ? song.song_title : ""} / {typeof song.difficulty === "string" ? song.difficulty : ""}</li>; })}</ul>{typeof config.intermediate_interval_hours === "number" && <p className="mt-2 text-xs text-slate-500">中間発表間隔：{config.intermediate_interval_hours}時間</p>}</details>}
      </div><EventDecision id={event.id} onResult={setMessage} /></article>;
    })}</div>}
  </section>;
}
