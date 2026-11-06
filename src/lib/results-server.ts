import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllPages } from "@/lib/supabase/read-all";
import { bingoStandings, type BingoConfig } from "@/lib/bingo";
import { buildIrRanking, type IrSong } from "@/lib/ir";
import type { BingoSubmission, EventAttendance, IrSubmission, Member } from "@/types/database";

type Client = Awaited<ReturnType<typeof createClient>>;
export async function getBingoResults(supabase: Client, eventId: string, config: BingoConfig) {
  const [submissions, members, attendance] = await Promise.all([
    readAllPages<BingoSubmission>((from, to) => supabase.from("bingo_submissions").select("*", { count: "exact" }).eq("event_id", eventId).order("id").range(from, to)),
    readAllPages<Pick<Member, "id" | "display_name" | "status">>((from, to) => supabase.from("members").select("id,display_name,status", { count: "exact" }).eq("status", "active").order("id").range(from, to)),
    readAllPages<Pick<EventAttendance, "member_id" | "status">>((from, to) => supabase.from("event_attendances").select("id,member_id,status", { count: "exact" }).eq("event_id", eventId).order("id").range(from, to)),
  ]);
  return { submissions, standings: bingoStandings(config.size, submissions, members, attendance) };
}

export async function getIrRankingSource(supabase: Client, eventId: string, songs: IrSong[]) {
  const cutoff = new Date().toISOString();
  const [submissions, members] = await Promise.all([
    readAllPages<IrSubmission>((from, to) => supabase.from("ir_submissions").select("*", { count: "exact" }).eq("event_id", eventId).lte("submitted_at", cutoff).order("id").range(from, to)),
    readAllPages<Pick<Member, "id" | "display_name">>((from, to) => supabase.from("members").select("id,display_name", { count: "exact" }).order("id").range(from, to)),
  ]);
  return { submissions, members, cutoff, rankings: { ...buildIrRanking(songs, submissions, members), asOf: cutoff } };
}

export async function getIrLogs(supabase: Client, eventId: string) {
  const [submissions, members] = await Promise.all([
    readAllPages<IrSubmission>((from, to) => supabase.from("ir_submissions").select("*", { count: "exact" }).eq("event_id", eventId).order("id").range(from, to)),
    readAllPages<Pick<Member, "id" | "display_name">>((from, to) => supabase.from("members").select("id,display_name", { count: "exact" }).order("id").range(from, to)),
  ]);
  return { submissions, members };
}
