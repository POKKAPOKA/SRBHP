"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { approveOrRejectMember, bulkUpsertMembersFromCsv, createPreRegisteredMember, updateMemberRole } from "@/app/actions/members";
import type { ActionResult, Member, MemberInput, MemberRole } from "@/types/database";

const columns = ["email", "display_name", "grade", "role", "main_games", "discord_user_id"] as const;
const roleLabels: Record<MemberRole, string> = { leader: "サークル長", executive: "役員", member: "部員" };
const statusLabels: Record<Member["status"], string> = { pre_registered: "事前登録", pending_approval: "承認待ち", active: "有効", rejected: "拒否" };
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";
const button = "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const primary = "rounded-xl border border-violet-700 bg-violet-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50";

type CsvRow = Record<string, string>;
function parseRow(row: CsvRow, index: number): MemberInput {
  const email = (row.email ?? "").trim().toLowerCase();
  const display_name = (row.display_name ?? "").trim();
  const gradeText = (row.grade ?? "").trim();
  const role = (row.role ?? "").trim() as MemberRole;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error(`${index}行目: メールアドレスを確認してください。`);
  if (!display_name || display_name.length > 200) throw new Error(`${index}行目: 表示名を確認してください。`);
  if (gradeText && !/^[1-6]$/.test(gradeText)) throw new Error(`${index}行目: 学年は1〜6または空欄にしてください。`);
  if (!["member", "executive", "leader"].includes(role)) throw new Error(`${index}行目: role は member / executive / leader のいずれかにしてください。`);
  return { email, display_name, grade: gradeText ? Number(gradeText) : null, role, main_games: (row.main_games ?? "").split(";").map((s) => s.trim()).filter(Boolean), discord_user_id: (row.discord_user_id ?? "").trim() || null };
}

function safeCsvValue(value: string | number | null): string | number {
  if (value === null) return "";
  // Excel interprets leading control characters and formulas as executable cells.
  return typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
function downloadCsv(members: Member[]) {
  const data = members.map((m) => [m.email, m.display_name, m.grade, m.role, m.main_games.join(";"), m.discord_user_id].map(safeCsvValue));
  const csv = Papa.unparse({ fields: [...columns], data });
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "srb-members.csv"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

export default function MemberManager({ members, actor }: { members: Member[]; actor: Member }) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [preview, setPreview] = useState<MemberInput[]>([]);
  const [fileName, setFileName] = useState("");
  const [isPending, startTransition] = useTransition();
  const leader = actor.role === "leader";
  const run = (action: () => Promise<ActionResult>, onSuccess?: () => void) => {
    setMessage(null);
    startTransition(async () => { try { const result = await action(); setMessage(result); if (result.ok) onSuccess?.(); } catch { setMessage({ ok: false, message: "通信に失敗しました。もう一度お試しください。" }); } });
  };
  function readCsv(file: File | undefined) {
    setPreview([]); setFileName(""); setMessage(null);
    if (!file) return;
    if (file.size > 1_000_000) { setMessage({ ok: false, message: "CSVファイルは1MB以下にしてください。" }); return; }
    Papa.parse<CsvRow>(file, { header: true, skipEmptyLines: "greedy", transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(), complete: (result) => {
      try {
        if (result.errors.length) throw new Error("CSVの形式を確認してください。");
        const headers = result.meta.fields ?? [];
        if (columns.some((c) => !headers.includes(c)) || new Set(headers).size !== headers.length) throw new Error(`CSVの見出しを確認してください: ${columns.join(", ")}`);
        if (!result.data.length || result.data.length > 500) throw new Error("CSVは1〜500行で取り込んでください。");
        const rows = result.data.map((row, i) => parseRow(row, i + 2));
        if (new Set(rows.map((row) => row.email)).size !== rows.length) throw new Error("CSVに重複したメールアドレスがあります。");
        if (rows.some((row) => row.email === actor.email.toLowerCase() && row.role !== actor.role)) throw new Error("CSVから自分自身のロールは変更できません。");
        setPreview(rows); setFileName(file.name);
      } catch (error) { setMessage({ ok: false, message: error instanceof Error ? error.message : "CSVを読み込めませんでした。" }); }
    }, error: () => setMessage({ ok: false, message: "CSVファイルを読み込めませんでした。" }) });
  }
  const pending = members.filter((m) => m.status === "pending_approval");
  return <div className="mt-8 space-y-8">
    {message && <p role={message.ok ? "status" : "alert"} className={`rounded-xl border p-4 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.message}</p>}
    {leader && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">新規メンバーを事前登録</h2><p className="mt-2 text-sm text-slate-500">登録したメールアドレスで初回ログインすると自動的に有効になります。</p><form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); try { const row = parseRow(Object.fromEntries(columns.map((name) => [name, String(data.get(name) ?? "")])), 1); run(() => createPreRegisteredMember(row), () => form.reset()); } catch (error) { setMessage({ ok: false, message: error instanceof Error ? error.message : "入力内容を確認してください。" }); } }}>
      <label className="space-y-1 text-sm font-bold">メールアドレス<input className={field} name="email" type="email" required maxLength={254} /></label>
      <label className="space-y-1 text-sm font-bold">表示名<input className={field} name="display_name" required maxLength={200} /></label>
      <label className="space-y-1 text-sm font-bold">学年<input className={field} name="grade" type="number" min="1" max="6" /></label>
      <label className="space-y-1 text-sm font-bold">ロール<select className={field} name="role" defaultValue="member"><option value="member">部員</option><option value="executive">役員</option><option value="leader">サークル長</option></select></label>
      <label className="space-y-1 text-sm font-bold">メインゲーム（; 区切り）<input className={field} name="main_games" /></label>
      <label className="space-y-1 text-sm font-bold">DiscordユーザーID<input className={field} name="discord_user_id" maxLength={100} /></label>
      <div><button disabled={isPending} className={primary}>事前登録する</button></div>
    </form></section>}
    {leader && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">CSV一括インポート</h2><p className="mt-2 text-sm leading-6 text-slate-500">UTF-8形式。列: {columns.join(", ")}。メインゲームは半角セミコロン（;）区切りです。既存のログイン情報と状態は維持されます。自分自身のロールは変更できません。</p><label className="mt-4 block text-sm font-bold">CSVファイル<input type="file" accept=".csv,text/csv" className={`${field} mt-2`} onChange={(e) => { readCsv(e.target.files?.[0]); e.target.value = ""; }} disabled={isPending} /></label>
      {preview.length > 0 && <div className="mt-5"><p className="text-sm font-bold">プレビュー: {fileName}（{preview.length}件）</p><div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50"><tr>{columns.map((c) => <th className="p-3" key={c}>{c}</th>)}</tr></thead><tbody>{preview.map((row) => <tr key={row.email} className="border-t border-slate-200"><td className="p-3">{row.email}</td><td className="p-3">{row.display_name}</td><td className="p-3">{row.grade ?? "—"}</td><td className="p-3">{row.role}</td><td className="p-3">{row.main_games.join("; ")}</td><td className="p-3">{row.discord_user_id || "—"}</td></tr>)}</tbody></table></div><div className="mt-4 flex gap-3"><button type="button" className={primary} disabled={isPending} onClick={() => run(() => bulkUpsertMembersFromCsv(preview), () => { setPreview([]); setFileName(""); })}>この内容を取り込む</button><button type="button" className={button} disabled={isPending} onClick={() => { setPreview([]); setFileName(""); }}>キャンセル</button></div></div>}
    </section>}
    {leader && pending.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">承認待ち <span className="text-sm text-slate-500">{pending.length}件</span></h2><div className="mt-4 divide-y divide-slate-200">{pending.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-bold">{member.display_name}</p><p className="mt-1 text-sm text-slate-500">{member.email}</p></div><div className="flex gap-2"><button className={primary} disabled={isPending} onClick={() => run(() => approveOrRejectMember(member.id, "approve"))}>承認</button><button className={button} disabled={isPending} onClick={() => { if (window.confirm(`${member.display_name}さんの申請を拒否しますか？`)) run(() => approveOrRejectMember(member.id, "reject")); }}>拒否</button></div></div>)}</div></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">メンバー一覧</h2><p className="mt-2 text-sm text-slate-500">{members.length}名</p></div><button type="button" className={button} onClick={() => downloadCsv(members)}>CSVエクスポート ↓</button></div><div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-4">メンバー</th><th className="p-4">学年</th><th className="p-4">状態</th><th className="p-4">ロール</th>{leader && <th className="p-4">操作</th>}</tr></thead><tbody>{members.map((member) => { const canEdit = member.id !== actor.id && (leader || (member.role !== "leader")); return <tr key={member.id} className="border-t border-slate-200"><td className="p-4"><p className="font-bold">{member.display_name}{member.id === actor.id && "（自分）"}</p><p className="mt-1 text-slate-500">{member.email}</p></td><td className="p-4">{member.grade ?? "—"}</td><td className="p-4">{statusLabels[member.status]}</td><td className="p-4"><label className="sr-only" htmlFor={`role-${member.id}`}>{member.display_name}のロール</label><select id={`role-${member.id}`} className={field} value={member.role} disabled={!canEdit || isPending} onChange={(e) => { const role = e.target.value as MemberRole; run(() => updateMemberRole(member.id, role)); }}><option value="member">{roleLabels.member}</option><option value="executive">{roleLabels.executive}</option>{(leader || member.role === "leader") && <option value="leader">{roleLabels.leader}</option>}</select></td>{leader && <td className="p-4"><button className={button} disabled={isPending} onClick={() => { if (window.confirm(`${member.display_name}さんを削除しますか？ この操作は取り消せません。`)) run(() => approveOrRejectMember(member.id, "delete")); }}>削除</button></td>}</tr>; })}</tbody></table></div>{!members.length && <p className="mt-4 text-sm text-slate-500">メンバーはいません。</p>}{!leader && <p className="mt-4 text-xs leading-5 text-slate-500">自分自身とサークル長は変更できません。</p>}</section>
  </div>;
}
