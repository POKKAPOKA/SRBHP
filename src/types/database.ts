export type MemberRole = "leader" | "executive" | "member";
export type MemberStatus = "pre_registered" | "pending_approval" | "active" | "rejected";
export type EventType = "free" | "bingo" | "ir";
export type EventStatus = "pending" | "approved" | "published" | "rejected";
export type AttendanceStatus = "attending" | "late_early" | "absent";
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Member {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  grade: number | null;
  role: MemberRole;
  status: MemberStatus;
  main_games: string[];
  discord_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  event_type: EventType;
  status: EventStatus;
  start_at: string;
  end_at: string;
  location: string;
  config: Json;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventAttendance {
  id: string;
  event_id: string;
  member_id: string;
  status: AttendanceStatus;
  arrival_time: string | null;
  departure_time: string | null;
  note: string;
  updated_at: string;
}
export interface BingoSubmission {
  id: string;
  event_id: string;
  member_id: string;
  cell_index: number;
  proof_image_url: string | null;
  comment: string;
  created_at: string;
}
export interface IrSubmission {
  id: string;
  event_id: string;
  member_id: string;
  game_title: string;
  song_title: string;
  difficulty: string;
  score: number;
  judge_breakdown: Record<string, number>;
  ai_commentary: string;
  proof_image_url: string;
  submitted_at: string;
}
export interface IrSnapshot {
  id: string;
  event_id: string;
  is_final: boolean;
  title: string;
  rankings_data: Json;
  overall_commentary: string;
  published_at: string;
}

export interface MemberInput {
  email: string;
  display_name: string;
  grade: number | null;
  role: MemberRole;
  main_games: string[];
  discord_user_id: string | null;
}

export interface ActionResult { ok: boolean; message: string }
