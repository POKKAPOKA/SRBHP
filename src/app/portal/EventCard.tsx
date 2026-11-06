"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveAttendance } from "@/app/actions/events";
import { attendanceLabels, eventTypeLabels, formatEventDate, googleCalendarUrl } from "@/lib/events";
import type { ActionResult, AttendanceStatus, Event, EventAttendance } from "@/types/database";

const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";

export default function EventCard({ event, attendance }: { event: Event; attendance: EventAttendance | null }) {
  const [showDetails, setShowDetails] = useState(attendance?.status === "late_early");
  const [arrival, setArrival] = useState(attendance?.arrival_time ?? "");
  const [departure, setDeparture] = useState(attendance?.departure_time ?? "");
  const [note, setNote] = useState(attendance?.note ?? "");
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  function save(status: AttendanceStatus) {
    setMessage(null);
    if (status === "late_early") setShowDetails(true);
    startTransition(async () => {
      try {
        const result = await saveAttendance({ eventId: event.id, status, arrival_time: status === "late_early" ? arrival || null : null, departure_time: status === "late_early" ? departure || null : null, note: status === "late_early" ? note : "" });
        setMessage(result);
        if (result.ok && status !== "late_early") setShowDetails(false);
      } catch { setMessage({ ok: false, message: "通信に失敗しました。もう一度お試しください。" }); }
    });
  }
  return <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-none">
    <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-700">{eventTypeLabels[event.event_type]}</span>{event.status === "published" && <span className="rounded-xl border border-slate-200 px-3 py-1.5 text-slate-500">結果公開</span>}</div>
    <h2 className="mt-5 text-xl font-bold"><Link className="hover:text-violet-700" href={`/portal/events/${event.id}`}>{event.title} ↗</Link></h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">{formatEventDate(event.start_at)} 〜 {formatEventDate(event.end_at)}<br />{event.location || "場所未定"}</p>
    <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-500">{event.description || "詳細はイベントページをご確認ください。"}</p>
    <div className="mt-6 border-t border-slate-200 pt-5"><p className="text-sm font-bold">出欠 {attendance && <span className="ml-2 font-normal text-violet-700">登録済み：{attendanceLabels[attendance.status]}</span>}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">{(["attending", "late_early", "absent"] as AttendanceStatus[]).map((status) => <button key={status} type="button" disabled={pending} aria-pressed={attendance?.status === status} onClick={() => save(status)} className={`rounded-xl border px-2 py-2.5 text-xs font-bold disabled:opacity-50 ${attendance?.status === status ? "border-violet-600 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{attendanceLabels[status]}</button>)}</div>
      {showDetails && <form className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={(e) => { e.preventDefault(); save("late_early"); }}><p className="text-xs text-slate-500">必要に応じて予定時刻やメモを追加できます。</p><div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-bold">到着予定<input className={field} type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} /></label><label className="space-y-1 text-xs font-bold">早退予定<input className={field} type="time" value={departure} onChange={(e) => setDeparture(e.target.value)} /></label></div><label className="block space-y-1 text-xs font-bold">一言メモ<textarea className={field} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label><button disabled={pending} className="rounded-xl border border-violet-700 bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">詳細を保存</button></form>}
      {message && <p role={message.ok ? "status" : "alert"} className={`mt-3 text-xs leading-5 ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.message}</p>}
      {attendance && attendance.status !== "absent" && <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Googleカレンダーに追加 ↗</a>}
    </div>
  </article>;
}
