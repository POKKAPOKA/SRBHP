"use client";

import { useActionState } from "react";
import { publishFreeResult } from "@/app/actions/ir";

export default function FreeResultAdmin({ eventId, hasFinal }: { eventId: string; hasFinal: boolean }) {
  const [state, action, pending] = useActionState(publishFreeResult, null);
  return <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold tracking-widest text-violet-600">FOR OFFICERS</p><h2 className="mt-2 text-xl font-bold">イベントハイライト</h2><p className="mt-2 text-sm leading-6 text-slate-500">活動の見どころを保存し、イベント結果ページで一般公開します。</p>{state && <p role={state.ok ? "status" : "alert"} className={`mt-4 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}{!hasFinal && <form action={action} className="mt-4 space-y-3"><input type="hidden" name="eventId" value={eventId} /><label className="block space-y-1 text-sm font-bold">ハイライト<textarea name="commentary" required maxLength={3000} rows={4} className="w-full rounded-xl border border-slate-200 p-3 font-normal" /></label><button disabled={pending} className="rounded-xl border border-violet-700 bg-violet-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending ? "公開中…" : "ハイライトを一般公開"}</button></form>}</section>;
}
