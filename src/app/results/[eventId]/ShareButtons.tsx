"use client";

import { useState } from "react";

export default function ShareButtons({ title }: { title: string }) {
  const [message, setMessage] = useState("");
  return <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => { const params = new URLSearchParams({ text: `${title}｜SRB イベント結果`, url: window.location.href }); window.open(`https://twitter.com/intent/tweet?${params.toString()}`, "_blank", "noopener,noreferrer"); }} className="rounded-xl border border-slate-800 bg-white px-5 py-3 text-sm font-bold text-slate-950">X でシェア ↗</button><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setMessage("URLをコピーしました。"); } catch { setMessage("コピーできませんでした。ブラウザのアドレス欄からコピーしてください。"); } }} className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-white hover:bg-slate-900">URLをコピー</button>{message && <span role="status" className="text-xs text-slate-300">{message}</span>}</div>;
}
