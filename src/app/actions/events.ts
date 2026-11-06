"use server";

import { revalidatePath } from "next/cache";
import { getActiveMember, getAdminMember } from "@/lib/portal-auth";
import { isUuid, type AttendanceInput, type EventInput } from "@/lib/events";
import { sendAttendanceReminder, sendEventApproval } from "@/lib/discord";
import { loadAnalyticsData } from "@/lib/analytics-server";
import { analyze, unansweredMembers } from "@/lib/analytics";
import { songKey } from "@/lib/ir";
import type { ActionResult, Event, Json } from "@/types/database";

function failure(error: unknown): ActionResult { return { ok: false, message: error instanceof Error ? error.message : "操作に失敗しました。" }; }
function refresh(eventId?: string) {
  revalidatePath("/portal");
  revalidatePath("/portal/admin/analytics");
  if (eventId) revalidatePath(`/portal/events/${eventId}`);
}
function stringValue(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") throw new Error(`${label}を確認してください。`);
  const result = value.trim();
  if (result.length > max || (required && !result)) throw new Error(`${label}を確認してください。`);
  return result;
}
function eventConfig(input: EventInput): Json {
  if (input.event_type === "free") return {};
  if (!input.config || typeof input.config !== "object" || Array.isArray(input.config)) throw new Error("企画の設定を確認してください。");
  const config = input.config as Record<string, unknown>;
  if (input.event_type === "bingo") {
    if ((config.size !== 3 && config.size !== 5) || !Array.isArray(config.missions) || config.missions.length !== config.size * config.size) throw new Error("ビンゴのサイズとマス数を確認してください。");
    return { size: config.size, missions: config.missions.map((v) => stringValue(v, "ミッション", 200, true)) };
  }
  if (input.event_type === "ir") {
    if (!Array.isArray(config.songs) || config.songs.length < 1 || config.songs.length > 30 || !Number.isInteger(config.intermediate_interval_hours) || Number(config.intermediate_interval_hours) < 1 || Number(config.intermediate_interval_hours) > 720) throw new Error("課題曲と中間発表間隔を確認してください。");
    const songs = config.songs.map((song: unknown) => {
      if (!song || typeof song !== "object" || Array.isArray(song)) throw new Error("課題曲を確認してください。");
      const row = song as Record<string, unknown>;
      return { game_title: stringValue(row.game_title, "機種", 100, true), song_title: stringValue(row.song_title, "曲名", 200, true), difficulty: stringValue(row.difficulty, "難易度", 100, true) };
    });
    if (new Set(songs.map(songKey)).size !== songs.length) throw new Error("課題曲の機種・曲名・難易度が重複しています。");
    return { songs, intermediate_interval_hours: Number(config.intermediate_interval_hours) };
  }
  throw new Error("イベント種別を確認してください。");
}

export async function createEvent(input: EventInput): Promise<ActionResult> {
  try {
    const { supabase, member } = await getActiveMember();
    if (!input || !["free", "bingo", "ir"].includes(input.event_type)) throw new Error("イベント種別を確認してください。");
    const title = stringValue(input.title, "イベント名", 120, true);
    const description = stringValue(input.description, "イベント概要", 3000);
    const location = stringValue(input.location, "場所", 200);
    if (typeof input.start_at !== "string" || typeof input.end_at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.start_at) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.end_at)) throw new Error("開始・終了日時を確認してください。");
    const start = new Date(input.start_at), end = new Date(input.end_at);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString() !== input.start_at || end.toISOString() !== input.end_at || end <= start) throw new Error("終了日時は開始日時より後にしてください。");
    const config = eventConfig(input);
    const { error } = await supabase.from("events").insert({ title, description, location, start_at: start.toISOString(), end_at: end.toISOString(), event_type: input.event_type, status: "pending", created_by: member.id, config });
    if (error) throw new Error("企画を申請できませんでした。入力内容と権限を確認してください。");
    refresh();
    return { ok: true, message: "企画を申請しました。役員の承認をお待ちください。" };
  } catch (error) { return failure(error); }
}

export async function saveAttendance(input: AttendanceInput): Promise<ActionResult> {
  try {
    const { supabase, member } = await getActiveMember();
    if (!input || !isUuid(input.eventId) || !["attending", "late_early", "absent"].includes(input.status)) throw new Error("出欠の内容を確認してください。");
    const { data: event, error: eventError } = await supabase.from("events").select("id,status").eq("id", input.eventId).in("status", ["approved", "published"]).maybeSingle();
    if (eventError || !event) throw new Error("対象のイベントを確認できませんでした。");
    let arrival: string | null = null, departure: string | null = null, note = "";
    if (input.status === "late_early") {
      const time = (value: unknown) => { if (value === null || value === "") return null; if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("時刻を確認してください。"); return value; };
      arrival = time(input.arrival_time); departure = time(input.departure_time); note = stringValue(input.note, "メモ", 500);
    }
    const { error } = await supabase.from("event_attendances").upsert({ event_id: event.id, member_id: member.id, status: input.status, arrival_time: arrival, departure_time: departure, note, updated_at: new Date().toISOString() }, { onConflict: "event_id,member_id" });
    if (error) throw new Error("出欠を保存できませんでした。もう一度お試しください。");
    refresh(event.id);
    return { ok: true, message: "出欠を保存しました。" };
  } catch (error) { return failure(error); }
}

export async function decideEvent(eventId: string, decision: "approve" | "reject"): Promise<ActionResult> {
  try {
    const { supabase, member } = await getAdminMember();
    if (!isUuid(eventId) || !["approve", "reject"].includes(decision)) throw new Error("操作内容を確認してください。");
    const values = decision === "approve" ? { status: "approved", approved_by: member.id } : { status: "rejected" };
    const { data, error } = await supabase.from("events").update(values).eq("id", eventId).eq("status", "pending").select("*").maybeSingle();
    if (error || !data) throw new Error("企画を更新できませんでした。権限または現在の状態を確認してください。");
    refresh(eventId);
    if (decision === "reject") return { ok: true, message: "企画を却下しました。" };
    const notification = await sendEventApproval(data as Event);
    if (notification.status === "sent") return { ok: true, message: "企画を承認し、Discordに告知しました。" };
    return { ok: true, message: notification.status === "skipped" ? "企画を承認しました。Discord通知は未設定のため送信していません。" : "企画を承認しましたが、Discord通知に失敗しました。" };
  } catch (error) { return failure(error); }
}

export async function remindMembers(eventId: string, group: "unanswered" | "dormant"): Promise<ActionResult> {
  try {
    const { supabase } = await getAdminMember();
    if (!isUuid(eventId) || !["unanswered", "dormant"].includes(group)) throw new Error("リマインド対象を確認してください。");
    const data = await loadAnalyticsData(supabase);
    const event = data.events.find((e) => e.id === eventId && ["approved", "published"].includes(e.status));
    if (!event) throw new Error("対象のイベントを確認できませんでした。");
    const result = analyze(data, new Date());
    if (group === "dormant" && result.recent.length < 3) throw new Error("終了したイベントが3件以上必要です。");
    const members = group === "unanswered" ? unansweredMembers(data, eventId) : result.dormant;
    const ids = members.map((m) => m.discord_user_id).filter((id): id is string => typeof id === "string" && /^\d{15,22}$/.test(id));
    if (!ids.length) throw new Error("通知可能なDiscordユーザーIDがありません。");
    const notification = await sendAttendanceReminder(ids, group === "unanswered" ? `「${event.title}」の出欠が未回答です。` : "最近のイベントの出欠を確認してください。");
    if (notification.status === "skipped") return { ok: false, message: "Discord通知が設定されていないため、送信していません。" };
    if (notification.status === "error") return { ok: false, message: notification.sent ? `${notification.sent}件に送信後、残りの送信に失敗しました。再送前にDiscordを確認してください。` : "Discordへの送信を確認できませんでした。再送前にDiscordを確認してください。" };
    return { ok: true, message: `${notification.sent}件のDiscordアカウントにリマインドを送信しました。` };
  } catch (error) { return failure(error); }
}
