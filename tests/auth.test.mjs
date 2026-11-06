import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function loadTs(file, mocks) {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const testModule = { exports: {} };
  const fakeRequire = (name) => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : nodeRequire(name);
  new Function("require", "module", "exports", code)(fakeRequire, testModule, testModule.exports);
  return testModule.exports;
}

function authActions(result) {
  const calls = { verify: [], revalidate: [] };
  const client = { auth: { verifyOtp: async (params) => { calls.verify.push(params); return result; } } };
  const actions = loadTs("src/app/actions/auth.ts", {
    "next/headers": { headers: async () => new Headers() },
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "next/cache": { revalidatePath: (...args) => calls.revalidate.push(args) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/provider-status": { oauthProviderStatus: async () => "enabled" },
  });
  return { actions, calls };
}

test("有効なメール認証は本人の確認操作後に検証し、セッション作成後にポータルへ移動する", async () => {
  const { actions, calls } = authActions({ data: { session: { access_token: "mock" } }, error: null });
  const form = new FormData(); form.set("token_hash", "a".repeat(64));
  await assert.rejects(() => actions.confirmEmail(form), /REDIRECT:\/portal/);
  assert.deepEqual(calls.verify, [{ token_hash: "a".repeat(64), type: "email" }]);
  assert.deepEqual(calls.revalidate, [["/", "layout"]]);
});

test("無効・期限切れ・セッションなしのメール認証は再送画面に戻す", async () => {
  const invalid = authActions({ data: { session: null }, error: null });
  const form = new FormData(); form.set("token_hash", "short");
  await assert.rejects(() => invalid.actions.confirmEmail(form), /REDIRECT:\/login\?error=expired/);
  assert.equal(invalid.calls.verify.length, 0);
  form.set("token_hash", "a".repeat(64));
  await assert.rejects(() => invalid.actions.confirmEmail(form), /REDIRECT:\/login\?error=expired/);
  assert.equal(invalid.calls.verify.length, 1);
  const expired = authActions({ data: { session: null }, error: { code: "otp_expired" } });
  await assert.rejects(() => expired.actions.confirmEmail(form), /REDIRECT:\/login\?error=expired/);
});

test("確認画面の表示だけではトークンを消費せず、ボタンに正しい値を渡す", async () => {
  const React = nodeRequire("react");
  const { renderToStaticMarkup } = nodeRequire("react-dom/server");
  let invoked = 0;
  const { default: ConfirmEmailPage } = loadTs("src/app/auth/confirm/page.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/app/actions/auth": { confirmEmail: () => { invoked++; } },
  });
  const page = await ConfirmEmailPage({ searchParams: Promise.resolve({ token_hash: "b".repeat(64), type: "email" }) });
  const html = renderToStaticMarkup(page);
  assert.equal(invoked, 0);
  assert.match(html, /メールを確認してログイン/);
  assert.match(html, new RegExp(`value="${"b".repeat(64)}"`));
  const invalidPage = await ConfirmEmailPage({ searchParams: Promise.resolve({ token_hash: "b".repeat(64), type: "recovery" }) });
  assert.doesNotMatch(renderToStaticMarkup(invalidPage), /メールを確認してログイン/);
});

test("OAuth の認可コードは従来どおりセッションに交換する", async () => {
  const codes = [];
  const { GET } = loadTs("src/app/auth/callback/route.ts", {
    "next/server": { NextResponse: { redirect: (url) => url.toString() } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { exchangeCodeForSession: async (code) => { codes.push(code); return { error: null }; } } }) },
  });
  assert.equal(await GET({ url: "http://localhost:3000/auth/callback?code=abc", nextUrl: new URL("http://localhost:3000/auth/callback?code=abc") }), "http://localhost:3000/portal");
  assert.deepEqual(codes, ["abc"]);
  assert.equal(await GET({ url: "http://localhost:3000/auth/callback", nextUrl: new URL("http://localhost:3000/auth/callback") }), "http://localhost:3000/login?error=callback");
});

test("無効なプロバイダーは Supabase の JSON エラーではなく案内画面に戻す", async () => {
  const calls = [];
  const actions = loadTs("src/app/actions/auth.ts", {
    "next/headers": { headers: async () => new Headers({ host: "localhost:3000" }) },
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createClient: async () => { calls.push("createClient"); return {}; } },
    "@/lib/supabase/provider-status": { oauthProviderStatus: async () => "disabled" },
  });
  await assert.rejects(() => actions.oauth("google"), /REDIRECT:\/login\?error=provider_disabled&provider=google/);
  await assert.rejects(() => actions.oauth("discord"), /REDIRECT:\/login\?error=provider_disabled&provider=discord/);
  await assert.rejects(() => actions.oauth("unknown"), /REDIRECT:\/login\?error=oauth/);
  assert.deepEqual(calls, []);
});

test("有効なプロバイダーと設定確認が一時的に失敗した場合は既存 OAuth フローを使う", async () => {
  for (const status of ["enabled", "unknown"]) {
    const calls = [];
    const actions = loadTs("src/app/actions/auth.ts", {
      "next/headers": { headers: async () => new Headers({ host: "localhost:3000" }) },
      "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
      "next/cache": { revalidatePath: () => {} },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { signInWithOAuth: async (args) => { calls.push(args); return { data: { url: "https://example.test/authorize" }, error: null }; } } }) },
      "@/lib/supabase/provider-status": { oauthProviderStatus: async () => status },
    });
    await assert.rejects(() => actions.oauth("discord"), /REDIRECT:https:\/\/example.test\/authorize/);
    assert.equal(calls[0].provider, "discord");
    assert.equal(calls[0].options.redirectTo, "http://localhost:3000/auth/callback");
  }
});

test("公開設定の取得は有効・無効・取得失敗を区別し、毎回キャッシュせず確認する", async () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/supabase/provider-status.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} }, calls = [];
  let response = { ok: true, json: async () => ({ external: { google: true, discord: false } }) };
  const fakeFetch = async (...args) => { calls.push(args); if (response === "error") throw new Error("offline"); return response; };
  new Function("require", "module", "exports", "process", "fetch", code)(() => ({}), testModule, testModule.exports, { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test/", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" } }, fakeFetch);
  assert.equal(await testModule.exports.oauthProviderStatus("google"), "enabled");
  assert.equal(await testModule.exports.oauthProviderStatus("discord"), "disabled");
  assert.equal(calls[0][0], "https://example.test/auth/v1/settings");
  assert.equal(calls[0][1].cache, "no-store");
  response = "error";
  assert.equal(await testModule.exports.oauthProviderStatus("google"), "unknown");
});
