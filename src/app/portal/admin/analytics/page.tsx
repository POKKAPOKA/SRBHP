import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAnalyticsData } from "@/lib/analytics-server";
import { analyze, unansweredMembers } from "@/lib/analytics";
import { formatEventDate } from "@/lib/events";
import type { Member } from "@/types/database";
import AnalyticsCharts from "./AnalyticsCharts";
import { ReminderButton } from "./AdminControls";
import PendingEvents from "./PendingEvents";

function PeopleList({ people }: { people: Member[] }) {
  if (!people.length) return <p className="mt-4 text-sm text-slate-500">該当するメンバーはいません。</p>;
  return <ul className="mt-4 max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-slate-200">{people.map((person) => <li key={person.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="font-bold">{person.display_name}</span><span className="text-xs text-slate-500">{person.discord_user_id && /^\d{15,22}$/.test(person.discord_user_id) ? "Discord ID 登録済み" : "Discord ID 未設定"}</span></li>)}</ul>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: actor, error: actorError } = await supabase.from("members").select("role,status").eq("user_id", user.id).maybeSingle();
  if (actorError || !actor || actor.status !== "active") redirect("/portal/pending");
  if (!["leader", "executive"].includes(actor.role)) redirect("/portal");
  const params = await searchParams;
  let data;
  try { data = await loadAnalyticsData(supabase); }
  catch { return <main className="mx-auto min-h-[70vh] max-w-7xl px-6 py-16"><Link href="/portal" className="text-sm font-bold text-violet-700">← ポータルへ</Link><h1 className="mt-8 text-3xl font-black">イベント管理・参加率分析</h1><p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700">分析データを取得できませんでした。権限や接続状況を確認してください。</p></main>; }
  const now = new Date();
  const analysis = analyze(data, now);
  const pending = data.events.filter((event) => event.status === "pending").sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const events = data.events.filter((event) => event.status === "approved" || event.status === "published").sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const requestedId = typeof params.event === "string" ? params.event : undefined;
  const selected = events.find((event) => event.id === requestedId) ?? events.find((event) => Date.parse(event.end_at) >= now.getTime()) ?? events.at(-1);
  const unanswered = selected ? unansweredMembers(data, selected.id) : [];
  const validDiscordCount = (people: Member[]) => people.filter((m) => m.discord_user_id && /^\d{15,22}$/.test(m.discord_user_id)).length;
  return <main className="mx-auto min-h-[75vh] max-w-7xl px-5 pb-24 pt-14 sm:px-8"><Link href="/portal" className="text-sm font-bold text-slate-500 hover:text-violet-700">← ポータルへ</Link><p className="mt-8 text-xs font-bold tracking-widest text-violet-600">ADMIN DASHBOARD</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">イベント管理・参加率分析</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">企画の承認と、部員の参加状況を確認できます。</p>
    <div className="mt-9 space-y-10"><PendingEvents events={pending} />
      <section><div className="mb-5"><h2 className="text-2xl font-bold">参加率・エンゲージメント</h2><p className="mt-3 text-sm leading-7 text-slate-500">終了済みの承認・公開イベント {analysis.pastEvents.length} 件を対象に、現在の有効部員 {data.members.length} 名を分母として集計します。過去の在籍状況は反映されません。遅刻・早退は参加と遅刻率の両方に含みます。</p></div><AnalyticsCharts byTime={analysis.byTime} byType={analysis.byType} byGrade={analysis.byGrade} byGame={analysis.byGame} hasPast={analysis.pastEvents.length > 0} /></section>
      <section><div className="mb-5"><h2 className="text-2xl font-bold">出欠リマインド</h2><p className="mt-3 text-sm leading-7 text-slate-500">送信時に対象者を再確認し、有効な Discord ユーザー ID が登録されている人にのみ通知します。</p></div>
        {events.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">対象となる承認済みイベントはありません。</div> : <><form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5"><label htmlFor="event-filter" className="min-w-0 flex-1 space-y-1 text-sm font-bold">対象イベント<select id="event-filter" name="event" defaultValue={selected?.id} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">{events.map((event) => <option key={event.id} value={event.id}>{event.title}（{formatEventDate(event.start_at)}）</option>)}</select></label><button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold hover:bg-slate-50">表示</button></form>
          {selected && <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h3 className="text-lg font-bold">出欠未回答 <span className="text-sm font-normal text-slate-500">{unanswered.length}名</span></h3><p className="mt-2 text-xs leading-5 text-slate-500">「{selected.title}」の出欠をまだ登録していない有効部員。通知可能 {validDiscordCount(unanswered)}名。</p><PeopleList people={unanswered} /><div className="mt-4"><ReminderButton key={`${selected.id}-unanswered`} eventId={selected.id} group="unanswered" disabled={!validDiscordCount(unanswered)} /></div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h3 className="text-lg font-bold">直近3イベントの休眠メンバー <span className="text-sm font-normal text-slate-500">{analysis.dormant.length}名</span></h3><p className="mt-2 text-xs leading-5 text-slate-500">終了済みの直近3イベントすべてで、欠席または未回答だった有効部員。通知可能 {validDiscordCount(analysis.dormant)}名。</p>{analysis.recent.length < 3 ? <p className="mt-4 text-sm text-slate-500">終了済みイベントが3件以上になると表示されます。</p> : <><details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer font-bold text-violet-700">対象の3イベント</summary><ul className="mt-2 space-y-1">{analysis.recent.map((event) => <li key={event.id}>{event.title}（{formatEventDate(event.start_at)}）</li>)}</ul></details><PeopleList people={analysis.dormant} /></>}<div className="mt-4"><ReminderButton key={`${selected.id}-dormant`} eventId={selected.id} group="dormant" disabled={analysis.recent.length < 3 || !validDiscordCount(analysis.dormant)} /></div></section></div>}</>}
      </section>
    </div>
  </main>;
}
