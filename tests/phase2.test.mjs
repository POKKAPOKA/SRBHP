import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const nodeRequire = createRequire(import.meta.url);

// Load our TypeScript with explicit fakes: no database or Discord requests.
function loadTs(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  const fakeRequire = (name) => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : nodeRequire(name);
  new Function("require", "module", "exports", "process", "fetch", "console", code)(fakeRequire, testModule, testModule.exports, globals.process ?? process, globals.fetch ?? fetch, globals.console ?? console);
  return testModule.exports;
}

const eventsLib = loadTs("src/lib/events.ts");
const analytics = loadTs("src/lib/analytics.ts", { "./events": eventsLib });
const irLib = loadTs("src/lib/ir.ts");
const ids = {
  e1: "11111111-1111-4111-8111-111111111111", e2: "22222222-2222-4222-8222-222222222222", e3: "33333333-3333-4333-8333-333333333333", future: "44444444-4444-4444-8444-444444444444",
  m1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", m2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", m3: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", m4: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
const event = (id, start_at, end_at, event_type = "free", status = "approved") => ({ id, title: `event ${id.slice(0, 1)}`, start_at, end_at, event_type, status, description: "", location: "", config: {} });
const member = (id, grade, main_games, status = "active") => ({ id, user_id: id, email: `${id.slice(0, 1)}@example.com`, display_name: id.slice(0, 1), role: "member", status, grade, main_games, discord_user_id: id === ids.m3 ? "123456789012345678" : null });
const attendance = (event_id, member_id, status) => ({ event_id, member_id, status });
const fixture = {
  members: [member(ids.m1, 1, ["太鼓"]), member(ids.m2, 1, ["太鼓", "IIDX"]), member(ids.m3, 2, []), member(ids.m4, 2, [], "rejected")],
  events: [event(ids.e1, "2026-11-02T00:00:00.000Z", "2026-11-02T02:00:00.000Z"), event(ids.e2, "2026-11-03T05:00:00.000Z", "2026-11-03T07:00:00.000Z", "ir"), event(ids.e3, "2026-11-04T09:00:00.000Z", "2026-11-04T11:00:00.000Z", "bingo"), event(ids.future, "2026-12-01T00:00:00.000Z", "2026-12-01T02:00:00.000Z")],
  attendances: [attendance(ids.e1, ids.m1, "attending"), attendance(ids.e1, ids.m2, "late_early"), attendance(ids.e1, ids.m3, "absent"), attendance(ids.e1, ids.m4, "attending"), attendance(ids.e2, ids.m1, "absent"), attendance(ids.e2, ids.m2, "late_early"), attendance(ids.e3, ids.m1, "absent"), attendance(ids.e3, ids.m2, "absent")],
};

test("集計は有効部員と終了済みイベントを使い、遅刻を参加に含める", () => {
  const result = analytics.analyze(fixture, new Date("2026-11-06T00:00:00.000Z"));
  assert.equal(result.pastEvents.length, 3);
  assert.deepEqual(result.dormant.map((m) => m.id), [ids.m3]);
  const monday = result.byTime.find((x) => x.name === "月曜・午前");
  assert.equal(monday.participationRate, 66.7);
  assert.equal(monday.lateRate, 33.3);
  assert.equal(result.byType.find((x) => x.name === "自由企画").average, 2);
  assert.equal(result.byGrade.find((x) => x.name === "1年").activeRate, 100);
  assert.equal(result.byGrade.find((x) => x.name === "2年").activeRate, 0);
  assert.deepEqual(analytics.unansweredMembers(fixture, ids.e2).map((m) => m.id), [ids.m3]);
});

test("終了済みイベントが3件未満なら休眠者を抽出しない", () => {
  const result = analytics.analyze({ ...fixture, events: fixture.events.slice(0, 2) }, new Date("2026-11-06T00:00:00.000Z"));
  assert.equal(result.recent.length, 2);
  assert.deepEqual(result.dormant, []);
});

test("GoogleカレンダーURLは日時をUTC化し、文字をエンコードする", () => {
  const url = new URL(eventsLib.googleCalendarUrl({ title: "A&B 日本語", description: "案内 & 詳細", location: "四谷", start_at: "2026-11-06T23:30:00+09:00", end_at: "2026-11-07T01:00:00+09:00" }));
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.searchParams.get("text"), "A&B 日本語");
  assert.equal(url.searchParams.get("dates"), "20261106T143000Z/20261106T160000Z");
  assert.equal(url.searchParams.get("details"), "案内 & 詳細");
});

function eventActions({ adminAllowed = true, eventExists = true, updateError = false } = {}) {
  const calls = { inserts: [], upserts: [], updates: [], filters: [], notifications: [], invalidated: [] };
  const selected = { ...fixture.events[0], description: "説明", location: "四谷" };
  const chain = () => ({ eq(key, value) { calls.filters.push([key, value]); return this; }, in(key, value) { calls.filters.push([key, value]); return this; }, select() { return this; }, async maybeSingle() { return { data: eventExists && !updateError ? selected : null, error: updateError ? {} : null }; } });
  const supabase = { from(table) { return { select() { return chain(); }, async insert(row) { calls.inserts.push([table, row]); return { error: null }; }, async upsert(row, options) { calls.upserts.push([table, row, options]); return { error: null }; }, update(row) { calls.updates.push([table, row]); return chain(); } }; } };
  const actor = { ...fixture.members[0], role: "leader" };
  const mocks = {
    "next/cache": { revalidatePath: (p) => calls.invalidated.push(p) },
    "@/lib/portal-auth": { getActiveMember: async () => ({ supabase, member: actor }), getAdminMember: async () => { if (!adminAllowed) throw new Error("権限がありません。"); return { supabase, member: actor }; } },
    "@/lib/events": eventsLib,
    "@/lib/ir": irLib,
    "@/lib/discord": { sendEventApproval: async (v) => { calls.notifications.push(["approval", v]); return { status: "sent", sent: 1 }; }, sendAttendanceReminder: async (v) => { calls.notifications.push(["reminder", v]); return { status: "sent", sent: v.length }; } },
    "@/lib/analytics-server": { loadAnalyticsData: async () => fixture },
    "@/lib/analytics": analytics,
  };
  return { actions: loadTs("src/app/actions/events.ts", mocks), calls };
}

test("イベント申請はpending、申請者と検証済みのビンゴ設定を保存する", async () => {
  const { actions, calls } = eventActions();
  const input = { title: "  テスト  ", description: "概要", location: "四谷", event_type: "bingo", start_at: "2026-12-01T00:00:00.000Z", end_at: "2026-12-01T02:00:00.000Z", config: { size: 3, missions: Array(9).fill("達成する") } };
  assert.equal((await actions.createEvent(input)).ok, true);
  assert.equal(calls.inserts[0][1].status, "pending");
  assert.equal(calls.inserts[0][1].created_by, ids.m1);
  assert.equal(calls.inserts[0][1].title, "テスト");
  assert.equal(calls.inserts[0][1].config.missions.length, 9);
  assert.equal(calls.notifications.length, 0);
  assert.equal((await actions.createEvent({ ...input, config: { size: 3, missions: [] } })).ok, false);
  assert.equal(calls.inserts.length, 1);
});

test("出欠は本人のIDで保存し、不正な状態や未公開イベントを拒否する", async () => {
  const { actions, calls } = eventActions();
  const input = { eventId: ids.e1, status: "attending", member_id: ids.m2, arrival_time: "12:00", departure_time: null, note: "無視" };
  assert.equal((await actions.saveAttendance(input)).ok, true);
  assert.equal(calls.upserts[0][1].member_id, ids.m1);
  assert.equal(calls.upserts[0][1].arrival_time, null);
  assert.equal(calls.upserts[0][1].note, "");
  assert.equal(calls.upserts[0][2].onConflict, "event_id,member_id");
  assert.equal((await actions.saveAttendance({ ...input, status: "other" })).ok, false);
  assert.equal((await eventActions({ eventExists: false }).actions.saveAttendance(input)).ok, false);
});

test("承認は役員の検証後にpending行だけ更新し、更新成功時のみ通知する", async () => {
  const denied = eventActions({ adminAllowed: false });
  assert.equal((await denied.actions.decideEvent(ids.e1, "approve")).ok, false);
  assert.equal(denied.calls.updates.length, 0);
  const failed = eventActions({ updateError: true });
  assert.equal((await failed.actions.decideEvent(ids.e1, "approve")).ok, false);
  assert.equal(failed.calls.notifications.length, 0);
  const ok = eventActions();
  assert.equal((await ok.actions.decideEvent(ids.e1, "approve")).ok, true);
  assert.equal(ok.calls.updates[0][1].approved_by, ids.m1);
  assert.ok(ok.calls.filters.some(([k, v]) => k === "status" && v === "pending"));
  assert.equal(ok.calls.notifications.length, 1);
  const rejected = eventActions();
  assert.equal((await rejected.actions.decideEvent(ids.e1, "reject")).ok, true);
  assert.equal(rejected.calls.notifications.length, 0);
});

test("リマインド対象はDB上の出欠から再計算し、存在しないイベントを拒否する", async () => {
  const { actions, calls } = eventActions();
  assert.equal((await actions.remindMembers(ids.e2, "unanswered")).ok, true);
  assert.deepEqual(calls.notifications[0][1], ["123456789012345678"]);
  assert.equal((await actions.remindMembers("99999999-9999-4999-8999-999999999999", "unanswered")).ok, false);
  assert.equal(calls.notifications.length, 1);
});

test("CSVはリーダー権限を確認して単一RPCで送信する", async () => {
  const calls = [];
  let role = "leader";
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: ids.m1 } }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: ids.m1, user_id: ids.m1, role, status: "active", email: "a@example.com" }, error: null }) }) }) }), rpc: async (name, payload) => { calls.push([name, payload]); return { data: 1, error: null }; } };
  const actions = loadTs("src/app/actions/members.ts", { "next/cache": { revalidatePath: () => {} }, "@/lib/supabase/server": { createClient: async () => supabase } });
  const rows = [{ email: "z@example.com", display_name: "Z", grade: null, role: "member", main_games: [], discord_user_id: null }];
  assert.equal((await actions.bulkUpsertMembersFromCsv(rows)).ok, true);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "bulk_upsert_members");
  assert.equal(calls[0][1].payload[0].email, "z@example.com");
  role = "executive";
  assert.equal((await actions.bulkUpsertMembersFromCsv(rows)).ok, false);
  assert.equal(calls.length, 1);
});

test("役員は未ログインの事前登録者をロール変更でき、サークル長への変更は拒否される", async () => {
  const filters = [];
  const actor = { id: ids.m1, user_id: ids.m1, role: "executive", status: "active", email: "a@example.com" };
  const query = { eq(key, value) { filters.push(["eq", key, value]); return this; }, neq(key, value) { filters.push(["neq", key, value]); return this; }, in(key, value) { filters.push(["in", key, value]); return this; }, async select() { return { data: [{ id: ids.m2 }], error: null }; } };
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: ids.m1 } }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: actor, error: null }) }) }), update: () => query }) };
  const actions = loadTs("src/app/actions/members.ts", { "next/cache": { revalidatePath: () => {} }, "@/lib/supabase/server": { createClient: async () => supabase } });
  assert.equal((await actions.updateMemberRole(ids.m2, "executive")).ok, true);
  assert.ok(!filters.some((f) => f[1] === "user_id"));
  assert.equal((await actions.updateMemberRole(ids.m2, "leader")).ok, false);
  assert.equal((await actions.updateMemberRole(ids.m1, "member")).ok, false);
});

test("DBの最大返却件数がページサイズより少なくても全データを読む", async () => {
  const { readAllPages } = loadTs("src/lib/supabase/read-all.ts", { "server-only": {} });
  const rows = [1, 2, 3, 4, 5];
  const starts = [];
  const result = await readAllPages(async (start) => { starts.push(start); return { data: rows.slice(start, start + 2), error: null, count: rows.length }; });
  assert.deepEqual(result, rows);
  assert.deepEqual(starts, [0, 2, 4]);
  await assert.rejects(() => readAllPages(async () => ({ data: [], error: null, count: 1 })));
});

test("Discord通知は指定されたIDだけを許可し、未設定なら送信しない", async () => {
  const requests = [];
  const fakeFetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return { ok: true }; };
  const mocks = { "server-only": {}, "@/lib/events": eventsLib };
  const discord = loadTs("src/lib/discord.ts", mocks, { process: { env: { DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/123456789012345678/example" } }, fetch: fakeFetch });
  const result = await discord.sendAttendanceReminder(["123456789012345678", "@everyone", "123456789012345678"], "@everyone test");
  assert.equal(result.sent, 1);
  assert.deepEqual(requests[0].allowed_mentions, { parse: [], users: ["123456789012345678"] });
  const noWebhook = loadTs("src/lib/discord.ts", mocks, { process: { env: {} }, fetch: fakeFetch, console: { warn() {} } });
  assert.equal((await noWebhook.sendAttendanceReminder(["123456789012345678"], "test")).status, "skipped");
  assert.equal(requests.length, 1);
});
