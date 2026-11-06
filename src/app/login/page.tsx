import { emailLogin, oauth } from "@/app/actions/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; provider?: string; sent?: string }> }) {
  const params = await searchParams;
  const providerName = params.provider === "google" ? "Google" : params.provider === "discord" ? "Discord" : "この方法";
  const errorMessage = params.error === "provider_disabled"
    ? `${providerName}でのログインは現在準備中です。サークルの管理者にお問い合わせいただくか、メールでログインしてください。`
    : params.error === "expired"
      ? "メールの認証リンクが期限切れ、または使用済みです。新しいメールを送信し、最新のリンクを開いてください。"
      : params.error === "callback"
        ? "認証を完了できませんでした。メールのリンクは期限切れや使用済みの場合があります。Google・Discord の場合はログインを始めたブラウザで、もう一度お試しください。"
        : params.error === "oauth"
          ? "外部サービスでログインできませんでした。設定や通信状況を確認して、もう一度お試しください。"
          : "ログインできませんでした。時間をおいて再度お試しください。";
  return <main className="mx-auto min-h-[70vh] max-w-md px-6 py-20">
    <p className="text-xs font-bold tracking-widest text-violet-600">MEMBER PORTAL</p>
    <h1 className="mt-4 text-4xl font-black">おかえりなさい。</h1>
    <p className="mt-4 leading-7 text-slate-500">部員ポータルにログインします。</p>
    <div className="mt-10 space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-none">
      {params.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{errorMessage}</p>}
      {params.sent && <p role="status" className="text-sm leading-6 text-emerald-700">メールを送信しました。最新のメールのリンクを開いてください。</p>}
      <form action={oauth.bind(null, "google")}><button className="w-full rounded-xl border border-slate-200 p-3 font-bold shadow-none hover:bg-slate-50">Google でログイン</button></form>
      <form action={oauth.bind(null, "discord")}><button className="w-full rounded-xl border border-slate-200 p-3 font-bold shadow-none hover:bg-slate-50">Discord でログイン</button></form>
      <div className="py-3 text-center text-xs text-slate-400">またはメールアドレスで</div>
      <form action={emailLogin} className="space-y-3"><label htmlFor="email" className="text-sm font-bold">メールアドレス</label><input id="email" name="email" type="email" required className="w-full rounded-xl border border-slate-200 p-3 shadow-none" placeholder="you@example.com" /><button className="w-full rounded-xl border border-violet-700 bg-violet-700 p-3 font-bold text-white shadow-none">ログインリンクを送信</button></form>
    </div>
  </main>;
}
