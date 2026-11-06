import type { Event, EventAttendance, EventType, Member } from "@/types/database";
import { eventTypeLabels } from "./events";

export type AnalyticsData = { events: Event[]; members: Member[]; attendances: EventAttendance[] };
export type RatePoint = { name: string; participationRate: number; lateRate: number; events: number };
export type GroupPoint = { name: string; activeRate: number; members: number; active: number };
export type TypePoint = { name: string; average: number; events: number };

const round = (n: number) => Math.round(n * 10) / 10;
const attended = (status: EventAttendance["status"]) => status === "attending" || status === "late_early";

export function analyze(data: AnalyticsData, now: Date) {
  const members = data.members.filter((m) => m.status === "active");
  const memberIds = new Set(members.map((m) => m.id));
  const pastEvents = data.events.filter((e) => ["approved", "published"].includes(e.status) && new Date(e.end_at).getTime() <= now.getTime()).sort((a, b) => Date.parse(b.end_at) - Date.parse(a.end_at));
  const pastIds = new Set(pastEvents.map((e) => e.id));
  const records = data.attendances.filter((a) => memberIds.has(a.member_id) && pastIds.has(a.event_id));
  const byEvent = new Map<string, EventAttendance[]>();
  for (const row of records) { const group = byEvent.get(row.event_id) ?? []; group.push(row); byEvent.set(row.event_id, group); }
  const eventStats = (id: string) => {
    const rows = byEvent.get(id) ?? [];
    return { participants: rows.filter((a) => attended(a.status)).length, late: rows.filter((a) => a.status === "late_early").length };
  };

  const weekdayFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "short", hour: "2-digit", hourCycle: "h23" });
  const slots = new Map<string, { order: number; events: number; participants: number; late: number }>();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  for (const event of pastEvents) {
    const parts = weekdayFormat.formatToParts(new Date(event.start_at));
    const day = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const slot = hour < 5 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    const label = ["深夜", "午前", "午後", "夜"][slot];
    const name = `${day}曜・${label}`;
    const group = slots.get(name) ?? { order: weekdays.indexOf(day) * 4 + slot, events: 0, participants: 0, late: 0 };
    const stats = eventStats(event.id); group.events++; group.participants += stats.participants; group.late += stats.late; slots.set(name, group);
  }
  const byTime: RatePoint[] = [...slots].sort((a, b) => a[1].order - b[1].order).map(([name, g]) => ({ name, events: g.events, participationRate: members.length ? round(g.participants * 100 / (g.events * members.length)) : 0, lateRate: members.length ? round(g.late * 100 / (g.events * members.length)) : 0 }));
  const byType: TypePoint[] = (["free", "bingo", "ir"] as EventType[]).map((type) => {
    const events = pastEvents.filter((e) => e.event_type === type);
    return { name: eventTypeLabels[type], events: events.length, average: events.length ? round(events.reduce((sum, e) => sum + eventStats(e.id).participants, 0) / events.length) : 0 };
  });
  const activeParticipants = new Set(records.filter((r) => attended(r.status)).map((r) => r.member_id));
  const makeGroups = (labels: (m: Member) => string[]): GroupPoint[] => {
    const groups = new Map<string, { members: number; active: number }>();
    for (const member of members) for (const name of new Set(labels(member))) { const group = groups.get(name) ?? { members: 0, active: 0 }; group.members++; if (activeParticipants.has(member.id)) group.active++; groups.set(name, group); }
    return [...groups].sort(([a], [b]) => a.localeCompare(b, "ja")).map(([name, g]) => ({ name, ...g, activeRate: round(g.active * 100 / g.members) }));
  };
  const byGrade = makeGroups((m) => [m.grade === null ? "未設定" : `${m.grade}年`]);
  const byGame = makeGroups((m) => m.main_games.length ? m.main_games : ["未設定"]);
  const recent = pastEvents.slice(0, 3);
  const dormant = recent.length === 3 ? members.filter((m) => recent.every((e) => !(byEvent.get(e.id) ?? []).some((a) => a.member_id === m.id && attended(a.status)))) : [];
  return { pastEvents, recent, dormant, byTime, byType, byGrade, byGame };
}

export function unansweredMembers(data: AnalyticsData, eventId: string): Member[] {
  const answered = new Set(data.attendances.filter((a) => a.event_id === eventId).map((a) => a.member_id));
  return data.members.filter((m) => m.status === "active" && !answered.has(m.id));
}
