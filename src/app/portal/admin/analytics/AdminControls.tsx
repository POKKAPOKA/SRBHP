"use client";

import { useState, useTransition } from "react";
import { decideEvent, remindMembers } from "@/app/actions/events";
import type { ActionResult } from "@/types/database";

const primary = "rounded-xl border border-violet-700 bg-violet-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50";
const secondary = "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50 disabled:opacity-50";

export function EventDecision({ id, onResult }: { id: string; onResult: (result: ActionResult) => void }) {
  const [pending, startTransition] = useTransition();
  const decide = (action: "approve" | "reject") => {
    startTransition(async () => { try { onResult(await decideEvent(id, action)); } catch { onResult({ ok: false, message: "通信結果を確認できませんでした。企画の状態を確認してください。" }); } });
  };
  return <div className="flex flex-wrap gap-2"><button className={primary} disabled={pending} onClick={() => decide("approve")}>承認して告知</button><button className={secondary} disabled={pending} onClick={() => decide("reject")}>却下</button></div>;
}

export function ReminderButton({ eventId, group, disabled }: { eventId: string; group: "unanswered" | "dormant"; disabled: boolean }) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return <div><button className={secondary} disabled={disabled || pending} onClick={() => { setMessage(null); startTransition(async () => { try { setMessage(await remindMembers(eventId, group)); } catch { setMessage({ ok: false, message: "送信結果を確認できませんでした。再送前にDiscordを確認してください。" }); } }); }}>{pending ? "送信中…" : "Discordでリマインド ↗"}</button>{message && <p role={message.ok ? "status" : "alert"} className={`mt-2 text-xs leading-5 ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.message}</p>}</div>;
}
