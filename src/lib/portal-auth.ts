import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/types/database";

export async function getActiveMember() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("ログインしてください。");
  const { data: member, error: memberError } = await supabase.from("members").select("*").eq("user_id", user.id).maybeSingle();
  if (memberError || !member || member.status !== "active") throw new Error("有効な部員のみ利用できます。");
  return { supabase, member: member as Member };
}

export async function getAdminMember() {
  const result = await getActiveMember();
  if (result.member.role !== "leader" && result.member.role !== "executive") throw new Error("役員以上の権限が必要です。");
  return result;
}
