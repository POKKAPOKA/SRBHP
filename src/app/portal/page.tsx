import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAllPages } from "@/lib/supabase/read-all";
import type { Event, EventAttendance } from "@/types/database";
import EventCard from "./EventCard";
import EventRequest from "./EventRequest";

export default async function Portal() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member, error: memberError } = await supabase.from("members").select("id,status").eq("user_id", user.id).maybeSingle();
  if (memberError || !member || member.status !== "active") redirect("/portal/pending");
  let events: Event[] = [], attendance: EventAttendance[] = [], loadError = false;
  try {
    [events, attendance] = await Promise.all([
      readAllPages<Event>((start, end) => supabase.from("events").select("*", { count: "exact" }).in("status", ["approved", "published"]).order("start_at", { ascending: true }).order("id").range(start, end)),
      readAllPages<EventAttendance>((start, end) => supabase.from("event_attendances").select("*", { count: "exact" }).eq("member_id", member.id).order("id").range(start, end)),
    ]);
  } catch { loadError = true; }
  const attendanceByEvent = new Map(attendance.map((row) => [row.event_id, row]));
  return <main className="mx-auto min-h-[75vh] max-w-7xl px-5 pb-28 pt-14 sm:px-8">
    <p className="text-xs font-bold tracking-widest text-violet-600">MEMBER PORTAL</p>
    <h1 className="mt-4 text-4xl font-black">イベント一覧</h1>
    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">参加するイベントを見つけて、出欠を登録しよう。新しい企画も申請できます。</p>
    {loadError ? <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700">イベント情報を取得できませんでした。時間をおいて再度お試しください。</p> : events.length === 0 ? <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">公開中のイベントはまだありません。</div> : <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} attendance={attendanceByEvent.get(event.id) ?? null} />)}</div>}
    <EventRequest />
  </main>;
}
