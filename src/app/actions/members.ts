"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Member, MemberInput, MemberRole } from "@/types/database";

const path = "/portal/admin/members";
const roles: MemberRole[] = ["member", "executive", "leader"];

async function authorized() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("ログインしてください。");
  const { data, error } = await supabase.from("members").select("id,user_id,email,role,status").eq("user_id", user.id).maybeSingle();
  if (error || !data || data.status !== "active" || !["leader", "executive"].includes(data.role)) throw new Error("この操作を行う権限がありません。");
  return { supabase, actor: data as Pick<Member, "id" | "user_id" | "email" | "role" | "status"> };
}

function validate(input: MemberInput): MemberInput {
  if (!input || typeof input.email !== "string" || typeof input.display_name !== "string" || !roles.includes(input.role)) throw new Error("入力内容を確認してください。");
  const email = input.email.trim().toLowerCase();
  const display_name = input.display_name.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !display_name || display_name.length > 200) throw new Error("メールアドレスと表示名を確認してください。");
  if (input.grade !== null && (!Number.isInteger(input.grade) || input.grade < 1 || input.grade > 6)) throw new Error("学年は1〜6で入力してください。");
  if (!Array.isArray(input.main_games) || input.main_games.length > 100 || input.main_games.some((v) => typeof v !== "string" || v.length > 200)) throw new Error("メインゲームを確認してください。");
  if (input.discord_user_id !== null && (typeof input.discord_user_id !== "string" || input.discord_user_id.length > 100)) throw new Error("DiscordユーザーIDを確認してください。");
  return { email, display_name, grade: input.grade, role: input.role, main_games: input.main_games.map((v) => v.trim()).filter(Boolean), discord_user_id: input.discord_user_id?.trim() || null };
}

function failure(error: unknown): ActionResult { return { ok: false, message: error instanceof Error ? error.message : "操作に失敗しました。" }; }

export async function createPreRegisteredMember(input: MemberInput): Promise<ActionResult> {
  try {
    const { supabase, actor } = await authorized();
    if (actor.role !== "leader") throw new Error("サークル長のみ追加できます。");
    const row = validate(input);
    const { error } = await supabase.from("members").insert({ ...row, status: "pre_registered" });
    if (error) throw new Error("追加できませんでした。メールアドレスの重複や入力内容を確認してください。");
    revalidatePath(path);
    return { ok: true, message: "メンバーを事前登録しました。" };
  } catch (error) { return failure(error); }
}

export async function bulkUpsertMembersFromCsv(inputs: MemberInput[]): Promise<ActionResult> {
  try {
    const { supabase, actor } = await authorized();
    if (actor.role !== "leader") throw new Error("サークル長のみインポートできます。");
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 500) throw new Error("CSVは1〜500行で取り込んでください。");
    const rows = inputs.map(validate);
    if (new Set(rows.map((row) => row.email)).size !== rows.length) throw new Error("CSVに重複したメールアドレスがあります。");
    if (rows.some((row) => row.email === actor.email.toLowerCase() && row.role !== actor.role)) throw new Error("CSVから自分自身のロールは変更できません。");
    const { data, error } = await supabase.rpc("bulk_upsert_members", { payload: rows });
    if (error || typeof data !== "number") throw new Error("CSVの取り込み結果を確認できませんでした。登録状況と入力内容、権限を確認してください。");
    revalidatePath(path);
    return { ok: true, message: `${data}件を取り込みました。` };
  } catch (error) { return failure(error); }
}

export async function approveOrRejectMember(id: string, operation: "approve" | "reject" | "delete"): Promise<ActionResult> {
  try {
    const { supabase, actor } = await authorized();
    if (actor.role !== "leader") throw new Error("サークル長のみ操作できます。");
    if (typeof id !== "string" || !["approve", "reject", "delete"].includes(operation)) throw new Error("操作内容が不正です。");
    const query = operation === "delete"
      ? supabase.from("members").delete().eq("id", id)
      : supabase.from("members").update({ status: operation === "approve" ? "active" : "rejected" }).eq("id", id).eq("status", "pending_approval");
    const { data, error } = await query.select("id");
    if (error || !data?.length) throw new Error("対象が存在しないか、状態が変更されています。画面を更新してください。");
    revalidatePath(path);
    return { ok: true, message: operation === "delete" ? "メンバーを削除しました。" : operation === "approve" ? "メンバーを承認しました。" : "申請を拒否しました。" };
  } catch (error) { return failure(error); }
}

export async function updateMemberRole(id: string, role: MemberRole): Promise<ActionResult> {
  try {
    const { supabase, actor } = await authorized();
    if (typeof id !== "string" || !roles.includes(role) || id === actor.id) throw new Error("指定したロールに変更できません。");
    if (actor.role === "executive" && role === "leader") throw new Error("役員はサークル長に変更できません。");
    let query = supabase.from("members").update({ role }).eq("id", id).neq("id", actor.id);
    if (actor.role === "executive") query = query.in("role", ["member", "executive"]);
    const { data, error } = await query.select("id");
    if (error || !data?.length) throw new Error("ロールを変更できませんでした。対象や権限を確認してください。");
    revalidatePath(path);
    return { ok: true, message: "ロールを変更しました。" };
  } catch (error) { return failure(error); }
}
