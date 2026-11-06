"use server";

import { revalidatePath } from "next/cache";
import { getActiveMember, getAdminMember } from "@/lib/portal-auth";
import { isUuid } from "@/lib/events";
import { parseIrSongs } from "@/lib/ir";
import { parseBingoConfig } from "@/lib/bingo";
import { readProof, uploadProof } from "@/lib/proofs";
import { analyzeResultImage } from "@/lib/gemini";
import { getBingoResults, getIrRankingSource } from "@/lib/results-server";
import { sendSnapshotAnnouncement } from "@/lib/discord";
import type { ActionResult, Event } from "@/types/database";

function failure(error: unknown): ActionResult { return { ok: false, message: error instanceof Error ? error.message : "操作に失敗しました。" }; }
function refresh(eventId: string, final: boolean) {
  revalidatePath(`/portal/events/${eventId}`);
  revalidatePath("/portal");
  if (final) { revalidatePath("/"); revalidatePath(`/results/${eventId}`); }
}
async function getEvent(supabase: Awaited<ReturnType<typeof getActiveMember>>["supabase"], eventId: string) {
  const { data, error } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error || !data) throw new Error("イベントを取得できませんでした。");
  return data as Event;
}

export async function submitIrResult(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { supabase, member } = await getActiveMember();
    const eventId = form.get("eventId");
    if (!isUuid(eventId)) throw new Error("イベントを確認してください。");
    const event = await getEvent(supabase, eventId);
    const songs = parseIrSongs(event.config);
    if (event.event_type !== "ir" || event.status !== "approved" || !songs) throw new Error("このイベントには提出できません。課題曲と公開状態を確認してください。");
    const image = await readProof(form.get("proof"), true);
    if (!image) throw new Error("証跡画像を選択してください。");
    const parsed = await analyzeResultImage(image.bytes, image.mime, songs);
    const current = await getEvent(supabase, eventId);
    if (current.status !== "approved") throw new Error("解析中にイベントが締め切られました。提出は保存されていません。");
    const imageUrl = await uploadProof(supabase, member.user_id!, eventId, image);
    const { error } = await supabase.from("ir_submissions").insert({ event_id: eventId, member_id: member.id, ...parsed, proof_image_url: imageUrl });
    if (error) throw new Error("提出結果を確認できませんでした。履歴を確認してから再度お試しください。");
    refresh(eventId, false);
    return { ok: true, message: "リザルトを提出しました。読み取り内容を履歴で確認してください。" };
  } catch (error) { return failure(error); }
}

export async function createIrSnapshot(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await getAdminMember();
    const eventId = form.get("eventId"), mode = form.get("mode"), commentary = form.get("commentary");
    if (!isUuid(eventId) || (mode !== "intermediate" && mode !== "final") || typeof commentary !== "string" || commentary.length > 3000 || (mode === "final" && !commentary.trim())) throw new Error("発表内容を確認してください。最終発表には大会総評が必要です。");
    const event = await getEvent(supabase, eventId);
    const songs = parseIrSongs(event.config);
    if (event.event_type !== "ir" || !songs || (mode === "intermediate" ? event.status !== "approved" : !["approved", "published"].includes(event.status))) throw new Error("このイベントでは発表を作成できません。");
    const { rankings } = await getIrRankingSource(supabase, eventId, songs);
    const final = mode === "final";
    if (final) {
      const { data, error } = await supabase.rpc("publish_event_snapshot", { p_event_id: eventId, p_title: `${event.title} 最終結果`, p_rankings: rankings, p_commentary: commentary.trim() });
      if (error || !isUuid(data)) throw new Error("最終公開を確認できませんでした。イベント状態と公開用RPCの設定を確認してください。");
    } else {
      const { count, error: countError } = await supabase.from("ir_snapshots").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("is_final", false);
      if (countError || count === null) throw new Error("中間発表を作成できませんでした。");
      const { error } = await supabase.from("ir_snapshots").insert({ event_id: eventId, is_final: false, title: `第${count + 1}回中間発表`, rankings_data: rankings, overall_commentary: commentary.trim() });
      if (error) throw new Error("中間発表を作成できませんでした。状態と権限を確認してください。");
    }
    refresh(eventId, final);
    const notification = await sendSnapshotAnnouncement(event, final);
    const suffix = notification.status === "sent" ? "Discordに通知しました。" : notification.status === "skipped" ? "Discord通知は未設定のため送信していません。" : "Discord通知に失敗しました。";
    return { ok: true, message: `${final ? "最終結果を公開しました。" : "中間発表を公開しました。"}${suffix}` };
  } catch (error) { return failure(error); }
}

export async function publishBingoResult(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await getAdminMember();
    const eventId = form.get("eventId"), commentary = form.get("commentary");
    if (!isUuid(eventId) || typeof commentary !== "string" || commentary.length > 3000) throw new Error("発表内容を確認してください。");
    const event = await getEvent(supabase, eventId);
    const config = parseBingoConfig(event.config);
    if (event.event_type !== "bingo" || !["approved", "published"].includes(event.status) || !config) throw new Error("このイベントでは発表を作成できません。");
    const { standings } = await getBingoResults(supabase, eventId, config);
    const { data, error } = await supabase.rpc("publish_event_snapshot", { p_event_id: eventId, p_title: `${event.title} 最終結果`, p_rankings: { kind: "bingo", version: 1, size: config.size, standings }, p_commentary: commentary.trim() });
    if (error || !isUuid(data)) throw new Error("最終公開を確認できませんでした。イベント状態と公開用RPCの設定を確認してください。");
    refresh(eventId, true);
    const notification = await sendSnapshotAnnouncement(event, true);
    return { ok: true, message: `ビンゴ結果を公開しました。${notification.status === "sent" ? "Discordに通知しました。" : notification.status === "skipped" ? "Discord通知は未設定のため送信していません。" : "Discord通知に失敗しました。"}` };
  } catch (error) { return failure(error); }
}

export async function publishFreeResult(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await getAdminMember();
    const eventId = form.get("eventId"), commentary = form.get("commentary");
    if (!isUuid(eventId) || typeof commentary !== "string" || !commentary.trim() || commentary.length > 3000) throw new Error("イベントのハイライトを入力してください。");
    const event = await getEvent(supabase, eventId);
    if (event.event_type !== "free" || !["approved", "published"].includes(event.status)) throw new Error("このイベントでは発表を作成できません。");
    const { data, error } = await supabase.rpc("publish_event_snapshot", { p_event_id: eventId, p_title: `${event.title} 活動ハイライト`, p_rankings: { kind: "free", version: 1 }, p_commentary: commentary.trim() });
    if (error || !isUuid(data)) throw new Error("公開を確認できませんでした。イベント状態と公開用RPCの設定を確認してください。");
    refresh(eventId, true);
    const notification = await sendSnapshotAnnouncement(event, true);
    return { ok: true, message: `ハイライトを公開しました。${notification.status === "sent" ? "Discordに通知しました。" : notification.status === "skipped" ? "Discord通知は未設定のため送信していません。" : "Discord通知に失敗しました。"}` };
  } catch (error) { return failure(error); }
}
