"use server";

import { revalidatePath } from "next/cache";
import { getActiveMember } from "@/lib/portal-auth";
import { isUuid } from "@/lib/events";
import { parseBingoConfig } from "@/lib/bingo";
import { readProof, uploadProof } from "@/lib/proofs";
import type { ActionResult } from "@/types/database";

export async function saveBingoSubmission(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { supabase, member } = await getActiveMember();
    const eventId = form.get("eventId"), indexText = form.get("cellIndex"), commentValue = form.get("comment");
    if (!isUuid(eventId) || typeof indexText !== "string" || !/^\d+$/.test(indexText) || typeof commentValue !== "string" || commentValue.length > 500) throw new Error("提出内容を確認してください。");
    const cellIndex = Number(indexText);
    const { data: event, error: eventError } = await supabase.from("events").select("event_type,status,config").eq("id", eventId).maybeSingle();
    const config = event ? parseBingoConfig(event.config) : null;
    if (eventError || !event || event.event_type !== "bingo" || event.status !== "approved" || !config || cellIndex < 0 || cellIndex >= config.size ** 2) throw new Error("このマスには提出できません。イベントの状態を確認してください。");
    const image = await readProof(form.get("proof"), false);
    const { data: existing, error: readError } = await supabase.from("bingo_submissions").select("proof_image_url").eq("event_id", eventId).eq("member_id", member.id).eq("cell_index", cellIndex).maybeSingle();
    if (readError) throw new Error("現在の提出を取得できませんでした。");
    const imageUrl = image ? await uploadProof(supabase, member.user_id!, eventId, image) : existing?.proof_image_url ?? null;
    const { error } = await supabase.from("bingo_submissions").upsert({ event_id: eventId, member_id: member.id, cell_index: cellIndex, comment: commentValue.trim(), proof_image_url: imageUrl }, { onConflict: "event_id,member_id,cell_index" });
    if (error) throw new Error("提出結果を確認できませんでした。更新状況を確認してください。");
    revalidatePath(`/portal/events/${eventId}`);
    return { ok: true, message: "ミッションを提出しました。" };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "提出できませんでした。" }; }
}
