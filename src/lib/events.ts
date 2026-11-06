import type { AttendanceStatus, Event, EventType } from "@/types/database";

export type EventInput = {
  title: string;
  description: string;
  event_type: EventType;
  start_at: string;
  end_at: string;
  location: string;
  config: unknown;
};
export type AttendanceInput = {
  eventId: string;
  status: AttendanceStatus;
  arrival_time: string | null;
  departure_time: string | null;
  note: string;
};
export const eventTypeLabels: Record<EventType, string> = { free: "自由企画", bingo: "ミッションビンゴ", ir: "自動集計IR" };
export const attendanceLabels: Record<AttendanceStatus, string> = { attending: "参加", late_early: "遅刻・早退", absent: "欠席" };

export function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function googleCalendarUrl(event: Pick<Event, "title" | "description" | "start_at" | "end_at" | "location">): string {
  const format = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const query = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${format(event.start_at)}/${format(event.end_at)}`, details: event.description, location: event.location });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
