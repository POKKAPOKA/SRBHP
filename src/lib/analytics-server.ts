import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllPages } from "@/lib/supabase/read-all";
import type { AnalyticsData } from "@/lib/analytics";
import type { Event, EventAttendance, Member } from "@/types/database";

type Client = Awaited<ReturnType<typeof createClient>>;
export async function loadAnalyticsData(supabase: Client): Promise<AnalyticsData> {
  const [events, members, attendances] = await Promise.all([
    readAllPages<Event>((start, end) => supabase.from("events").select("*", { count: "exact" }).in("status", ["pending", "approved", "published"]).order("id").range(start, end)),
    readAllPages<Member>((start, end) => supabase.from("members").select("*", { count: "exact" }).eq("status", "active").order("id").range(start, end)),
    readAllPages<EventAttendance>((start, end) => supabase.from("event_attendances").select("*", { count: "exact" }).order("id").range(start, end)),
  ]);
  return { events, members, attendances };
}
