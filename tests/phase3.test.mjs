import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function loadTs(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  const fakeRequire = (name) => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : nodeRequire(name);
  new Function("require", "module", "exports", "process", "fetch", "console", code)(fakeRequire, testModule, testModule.exports, globals.process ?? process, globals.fetch ?? fetch, globals.console ?? console);
  return testModule.exports;
}
const bingo = loadTs("src/lib/bingo.ts");
const ir = loadTs("src/lib/ir.ts");
const eventsLib = loadTs("src/lib/events.ts");
const ids = { e: "11111111-1111-4111-8111-111111111111", a: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", c: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", snap: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
const songs = [{ game_title: "CHUNITHM", song_title: "Song A", difficulty: "MASTER" }, { game_title: "maimai", song_title: "Song B", difficulty: "EXPERT" }];
const entry = (id, member_id, song, score, submitted_at, ai_commentary = "実況") => ({ id, member_id, ...song, score, submitted_at, ai_commentary, judge_breakdown: { critical: 10 }, proof_image_url: "https://example.com/image", event_id: ids.e });
const members = [{ id: ids.a, display_name: "A" }, { id: ids.b, display_name: "B" }, { id: ids.c, display_name: "C" }];

test("ビンゴの行・列・斜めとリーチを重複なく数える", () => {
  assert.deepEqual(bingo.bingoStats(3, [0, 1, 2, 3, 6, 6, 50]), { achieved: 5, reach: 1, lines: 2 });
  assert.deepEqual(bingo.bingoStats(5, [0, 6, 12, 18, 24]), { achieved: 5, reach: 0, lines: 1 });
  assert.equal(bingo.parseBingoConfig({ size: 3, missions: Array(8).fill("x") }), null);
  assert.equal(bingo.parseBingoConfig({ size: 3, missions: Array(9).fill("x") }).size, 3);
});

test("ビンゴ参加者を達成順で並べ、同順位の次に正しい順位を付ける", () => {
  const people = members.map((m) => ({ ...m, status: "active" }));
  const submissions = [{ member_id: ids.a, cell_index: 0 }, { member_id: ids.b, cell_index: 1 }];
  const rows = bingo.bingoStandings(3, submissions, people, [{ member_id: ids.c, status: "attending" }]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 1, 3]);
  assert.deepEqual(rows.map((r) => r.achieved), [1, 1, 0]);
  assert.equal(bingo.parseBingoRanking({ kind: "bingo", version: 1, size: 3, standings: rows }).standings.length, 3);
  assert.equal(bingo.parseBingoRanking({ kind: "bingo", version: 1, size: 9, standings: rows }), null);
});

test("IR は各曲の自己ベストを採用し、同点・未提出を順位点に反映する", () => {
  const rows = [entry("1", ids.a, songs[0], 100, "2026-01-01T00:00:00Z"), entry("2", ids.a, songs[0], 130, "2026-01-02T00:00:00Z", "最高記録"), entry("3", ids.b, songs[0], 130, "2026-01-03T00:00:00Z"), entry("4", ids.c, songs[0], 90, "2026-01-04T00:00:00Z"), entry("5", ids.a, songs[1], 80, "2026-01-05T00:00:00Z"), entry("6", ids.b, songs[1], -1, "2026-01-05T00:00:00Z")];
  const data = ir.buildIrRanking(songs, rows, members);
  assert.deepEqual(data.songs[0].entries.map((r) => r.rank), [1, 1, 3]);
  assert.equal(data.songs[0].entries[0].commentary, "最高記録");
  assert.deepEqual(data.overall.map((r) => [r.name, r.points, r.rank]), [["A", 6, 1], ["B", 3, 2], ["C", 1, 3]]);
  assert.ok(ir.parseIrRanking(data));
  assert.equal(ir.parseIrRanking({ ...data, overall: [null] }), null);
  assert.equal(ir.parseIrSongs({ songs: [songs[0], { ...songs[0], game_title: "ｃｈｕｎｉｔｈｍ" }] }), null);
});

test("証跡は画像シグネチャとサイズを検証して一意な名前で保存する", async () => {
  const proofs = loadTs("src/lib/proofs.ts", { "server-only": {}, "@/lib/supabase/server": {} });
  const image = await proofs.readProof(new File([new Uint8Array([0xff, 0xd8, 0xff, 0x01])], "test.jpg", { type: "image/jpeg" }), true);
  assert.equal(image.mime, "image/jpeg");
  await assert.rejects(() => proofs.readProof(new File(["hello"], "fake.jpg", { type: "image/jpeg" }), true));
  await assert.rejects(() => proofs.readProof(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }), true));
  assert.equal(await proofs.readProof(null, false), null);
  let storedPath = "";
  const client = { storage: { from: () => ({ upload: async (p) => { storedPath = p; return { error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: `https://example.com/${p}` } }) }) } };
  const url = await proofs.uploadProof(client, ids.a, ids.e, image);
  assert.ok(storedPath.startsWith(`${ids.a}/${ids.e}/`));
  assert.ok(url.endsWith(".jpg"));
});

test("Gemini は構造化 JSON・画像を使い、課題曲と判定を検証する", async () => {
  const calls = [];
  const result = { ...songs[0], score: 123456, judge_breakdown: { critical: 100, miss: 2 }, ai_commentary: "熱".repeat(60) };
  class FakeGoogleGenAI { constructor() { this.models = { generateContent: async (args) => { calls.push(args); return { text: JSON.stringify(result) }; } }; } }
  const fakeType = { OBJECT: "OBJECT", STRING: "STRING", INTEGER: "INTEGER" };
  const gemini = loadTs("src/lib/gemini.ts", { "server-only": {}, "@google/genai": { GoogleGenAI: FakeGoogleGenAI, Type: fakeType }, "@/lib/ir": ir }, { process: { env: { GEMINI_API_KEY: "fake" } } });
  const parsed = await gemini.analyzeResultImage(Buffer.from([1, 2, 3]), "image/png", songs);
  assert.equal(parsed.score, 123456);
  assert.equal(calls[0].model, "gemini-2.5-flash");
  assert.equal(calls[0].config.responseMimeType, "application/json");
  assert.equal(calls[0].contents[1].inlineData.mimeType, "image/png");
  assert.throws(() => gemini.validateGeminiResult({ ...result, song_title: "別の曲" }, songs));
  assert.throws(() => gemini.validateGeminiResult({ ...result, judge_breakdown: { miss: -1 } }, songs));
  assert.throws(() => gemini.validateGeminiResult({ ...result, ai_commentary: "短い" }, songs));
});

test("ビンゴの保存は本人のマスのみを更新し、公開後は受け付けない", async () => {
  let status = "approved"; const saved = [], uploads = [];
  const eventData = { event_type: "bingo", status, config: { size: 3, missions: Array(9).fill("ミッション") } };
  const query = (value) => ({ eq() { return this; }, async maybeSingle() { return { data: value(), error: null }; } });
  const client = { from(table) { return table === "events" ? { select: () => query(() => ({ ...eventData, status })) } : { select: () => query(() => ({ proof_image_url: "existing" })), upsert: async (row, options) => { saved.push({ row, options }); return { error: null }; } }; } };
  const mocks = { "next/cache": { revalidatePath() {} }, "@/lib/portal-auth": { getActiveMember: async () => ({ supabase: client, member: { id: ids.a, user_id: ids.a } }) }, "@/lib/events": eventsLib, "@/lib/bingo": bingo, "@/lib/proofs": { readProof: async () => null, uploadProof: async () => { uploads.push(true); return "new"; } } };
  const actions = loadTs("src/app/actions/bingo.ts", mocks);
  const form = new Map([["eventId", ids.e], ["cellIndex", "0"], ["comment", "達成"]]);
  assert.equal((await actions.saveBingoSubmission(null, form)).ok, true);
  assert.equal(saved[0].row.member_id, ids.a); assert.equal(saved[0].row.proof_image_url, "existing");
  assert.equal(saved[0].options.onConflict, "event_id,member_id,cell_index");
  form.set("cellIndex", "9"); assert.equal((await actions.saveBingoSubmission(null, form)).ok, false);
  form.set("cellIndex", "0"); status = "published"; assert.equal((await actions.saveBingoSubmission(null, form)).ok, false);
  assert.equal(saved.length, 1); assert.equal(uploads.length, 0);
});

test("IR 最終発表は役員だけが単一 RPC を呼び、失敗時は通知しない", async () => {
  const calls = { rpc: [], notifications: [] }; let permitted = true, rpcError = false;
  const event = { id: ids.e, title: "大会", event_type: "ir", status: "approved", config: { songs } };
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: event, error: null }) }) }) }), rpc: async (name, payload) => { calls.rpc.push([name, payload]); return { data: rpcError ? null : ids.snap, error: rpcError ? {} : null }; } };
  const mocks = { "next/cache": { revalidatePath() {} }, "@/lib/portal-auth": { getActiveMember: async () => ({ supabase: client, member: { id: ids.a, user_id: ids.a } }), getAdminMember: async () => { if (!permitted) throw new Error("権限なし"); return { supabase: client }; } }, "@/lib/events": eventsLib, "@/lib/ir": ir, "@/lib/bingo": bingo, "@/lib/proofs": {}, "@/lib/gemini": {}, "@/lib/results-server": { getIrRankingSource: async () => ({ rankings: ir.buildIrRanking(songs, [], members) }) }, "@/lib/discord": { sendSnapshotAnnouncement: async (e, final) => { calls.notifications.push([e.id, final]); return { status: "sent", sent: 1 }; } } };
  const actions = loadTs("src/app/actions/ir.ts", mocks);
  const form = new Map([["eventId", ids.e], ["mode", "final"], ["commentary", "皆さんお疲れさまでした。"]]);
  permitted = false; assert.equal((await actions.createIrSnapshot(null, form)).ok, false); assert.equal(calls.rpc.length, 0);
  permitted = true; rpcError = true; assert.equal((await actions.createIrSnapshot(null, form)).ok, false); assert.equal(calls.notifications.length, 0);
  rpcError = false; assert.equal((await actions.createIrSnapshot(null, form)).ok, true);
  assert.equal(calls.rpc.at(-1)[0], "publish_event_snapshot"); assert.equal(calls.rpc.at(-1)[1].p_rankings.kind, "ir"); assert.deepEqual(calls.notifications, [[ids.e, true]]);
  event.event_type = "free";
  assert.equal((await actions.publishFreeResult(null, new Map([["eventId", ids.e], ["commentary", "活動のハイライト"]]))).ok, true);
  assert.equal(calls.rpc.at(-1)[1].p_rankings.kind, "free");
});

test("IR は画像解析後に本人の提出を保存し、解析中に公開された場合は保存しない", async () => {
  const calls = { reads: 0, uploads: 0, inserts: [] };
  let publishDuringAnalysis = false;
  const parsed = { ...songs[0], score: 123, judge_breakdown: { miss: 1 }, ai_commentary: "熱".repeat(60) };
  const client = { from(table) {
    if (table === "events") return { select: () => ({ eq: () => ({ maybeSingle: async () => { calls.reads++; return { data: { id: ids.e, event_type: "ir", status: publishDuringAnalysis && calls.reads % 2 === 0 ? "published" : "approved", config: { songs } }, error: null }; } }) }) };
    return { insert: async (row) => { calls.inserts.push(row); return { error: null }; } };
  } };
  const mocks = { "next/cache": { revalidatePath() {} }, "@/lib/portal-auth": { getActiveMember: async () => ({ supabase: client, member: { id: ids.a, user_id: ids.a } }), getAdminMember: async () => { throw new Error("unused"); } }, "@/lib/events": eventsLib, "@/lib/ir": ir, "@/lib/bingo": bingo, "@/lib/proofs": { readProof: async () => ({ bytes: Buffer.from([1]), mime: "image/png", extension: "png" }), uploadProof: async () => { calls.uploads++; return "https://example.com/proof.png"; } }, "@/lib/gemini": { analyzeResultImage: async () => parsed }, "@/lib/results-server": {}, "@/lib/discord": {} };
  const actions = loadTs("src/app/actions/ir.ts", mocks);
  const form = new Map([["eventId", ids.e], ["proof", "fake"]]);
  assert.equal((await actions.submitIrResult(null, form)).ok, true);
  assert.equal(calls.inserts[0].member_id, ids.a); assert.equal(calls.inserts[0].score, 123);
  publishDuringAnalysis = true;
  assert.equal((await actions.submitIrResult(null, form)).ok, false);
  assert.equal(calls.uploads, 1); assert.equal(calls.inserts.length, 1);
});
