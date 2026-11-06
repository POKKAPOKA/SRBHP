import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmail } from "@/app/actions/auth";

export const metadata: Metadata = { title: "メール認証 | SRB", robots: { index: false, follow: false } };

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }> }) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valid = typeof tokenHash === "string" && /^[A-Za-z0-9_-]{16,512}$/.test(tokenHash) && type === "email";
  return <main className="mx-auto min-h-[70vh] max-w-md px-6 py-20"><p className="text-xs font-bold tracking-widest text-violet-600">MEMBER PORTAL</p><h1 className="mt-4 text-3xl font-black">メールアドレスの確認</h1><div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-none">{valid ? <><p className="text-sm leading-7 text-slate-600">ログインを完了するには、下のボタンを押してください。リンクは一度だけ使用できます。</p><form action={confirmEmail} className="mt-6"><input type="hidden" name="token_hash" value={tokenHash} /><button className="w-full rounded-xl border border-violet-700 bg-violet-700 px-5 py-3 font-bold text-white shadow-none hover:bg-violet-800">メールを確認してログイン</button></form></> : <><p role="alert" className="text-sm leading-7 text-red-700">認証リンクが無効です。ログイン画面から新しいメールを送信してください。</p><Link href="/login" className="mt-6 inline-block rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">ログイン画面へ</Link></>}</div></main>;
}
