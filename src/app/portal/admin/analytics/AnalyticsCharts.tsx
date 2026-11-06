"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GroupPoint, RatePoint, TypePoint } from "@/lib/analytics";

const tooltip = { border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "none", fontSize: "12px" };
const card = "min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-none sm:p-6";
const tick = { fontSize: 11, fill: "#64748b" };

function Empty({ message }: { message: string }) { return <div className="mt-4 flex h-56 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">{message}</div>; }

function DemographicChart({ title, data, enabled }: { title: string; data: GroupPoint[]; enabled: boolean }) {
  return <section className={card}><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">該当する有効部員のうち、終了済みイベントに1回以上参加・遅刻早退で回答した割合。</p>{!enabled || !data.length ? <Empty message="集計できるデータがありません。" /> : <div className="mt-5 h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 10, left: -12, bottom: 36 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="name" tick={tick} angle={-25} textAnchor="end" interval={0} /><YAxis domain={[0, 100]} tick={tick} tickFormatter={(value: number) => `${value}%`} /><Tooltip contentStyle={tooltip} formatter={(value) => [`${value}%`, "参加した部員の割合"]} /><Bar dataKey="activeRate" name="参加した部員の割合" fill="#8b5cf6" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>}</section>;
}

export default function AnalyticsCharts({ byTime, byType, byGrade, byGame, hasPast }: { byTime: RatePoint[]; byType: TypePoint[]; byGrade: GroupPoint[]; byGame: GroupPoint[]; hasPast: boolean }) {
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className={card}><h3 className="text-lg font-bold">曜日・時間帯別の参加率</h3><p className="mt-2 text-xs leading-5 text-slate-500">開始日時を日本時間で分類。参加率は「参加」と「遅刻・早退」、遅刻率は「遅刻・早退」の回答を集計します。</p>{!byTime.length ? <Empty message="終了済みイベントはありません。" /> : <div className="mt-5 h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={byTime} margin={{ top: 10, right: 10, left: -12, bottom: 28 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="name" tick={tick} angle={-25} textAnchor="end" interval={0} /><YAxis domain={[0, 100]} tick={tick} tickFormatter={(value: number) => `${value}%`} /><Tooltip contentStyle={tooltip} formatter={(value) => `${value}%`} /><Legend verticalAlign="top" /><Bar dataKey="participationRate" name="参加率" fill="#7c3aed" radius={[5, 5, 0, 0]} /><Bar dataKey="lateRate" name="遅刻・早退率" fill="#f59e0b" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>}</section>
    <section className={card}><h3 className="text-lg font-bold">種別ごとの平均参加人数</h3><p className="mt-2 text-xs leading-5 text-slate-500">終了済みイベントのうち、「参加」または「遅刻・早退」で回答した有効部員の平均人数。</p>{!hasPast ? <Empty message="終了済みイベントはありません。" /> : <div className="mt-5 h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={byType} margin={{ top: 10, right: 10, left: -12, bottom: 10 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="name" tick={tick} /><YAxis tick={tick} allowDecimals={false} /><Tooltip contentStyle={tooltip} formatter={(value) => [`${value}人`, "平均参加人数"]} /><Bar dataKey="average" name="平均参加人数" fill="#0d9488" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>}</section>
    <DemographicChart title="学年別の参加した部員の割合" data={byGrade} enabled={hasPast} />
    <DemographicChart title="メイン機種別の参加した部員の割合" data={byGame} enabled={hasPast} />
  </div>;
}
