# SRB 公式サイト・部員ポータル

上智大学の音ゲー・ゲーム制作サークル SRB の公式サイトと部員ポータルです。Next.js App Router、TypeScript、Tailwind CSS、Supabase Auth / PostgreSQL / Storage を使用します。

## 主な機能

- **公式サイト**: 活動紹介、公開済みイベントの結果、TAiKOTYPiNG へのリンク。
- **認証・部員管理**: Google / Discord / メールリンク認証、承認待ち、ロール管理、メンバー CSV のプレビュー・一括取込・出力。
- **イベント**: 企画申請、役員による承認、出欠登録、Google カレンダー追加、参加率分析、Discord 通知。
- **ミッションビンゴ**: 3×3・5×5 の達成記録、証跡画像、リーチと成立ライン、参加者の達成状況。
- **IR**: Gemini による画像の読み取り、個人提出履歴、課題曲ごとの自己ベスト、中間・最終発表、全提出ログの CSV 出力。
- **一般公開**: 最終発表の表彰台、ランキング、総評、共有ボタンと OGP。最終ビンゴ結果も公開可能です。

## 開発環境

Docker Desktop で Compose の `web` サービスを起動した状態で、プロジェクトの依存関係をインストールし、開発サーバーを開始します。表示先は `http://localhost:3000` です。

```bash
docker compose exec web pnpm install --frozen-lockfile
docker compose exec web pnpm dev
```

型検査、テスト、Lint、本番ビルド:

```bash
docker compose exec web pnpm exec node --test tests/auth.test.mjs tests/phase2.test.mjs tests/phase3.test.mjs
docker compose exec web pnpm exec tsc --noEmit
docker compose exec web pnpm lint
docker compose exec web pnpm build
```

テストは Supabase・Gemini・Discord を模擬し、実サービスへ接続しません。実環境の RLS、Storage、OAuth、RPC、Gemini、Webhook の結合動作は別途確認してください。

## 環境変数

プロジェクトルートの `./.env.local` に設定します。実際のキーをソース管理へ含めないでください。

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | Supabase のプロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必須 | RLS を適用する公開キー |
| `GEMINI_API_KEY` | IR の画像解析時 | Gemini API のサーバー専用キー |
| `DISCORD_WEBHOOK_URL` | 任意 | 承認・発表・リマインド通知。未設定なら通知をスキップ |
| `NEXT_PUBLIC_SITE_URL` | 一般公開・通知時に設定 | 本番サイトの基点 URL。OGP、正規 URL、Discord の結果リンクに使用 |
| `NEXT_PUBLIC_TAIKOTYPING_URL` | 任意 | ゲームのリンク先。未設定時は既定の公開 URL |

`SUPABASE_SERVICE_ROLE_KEY` は使用しません。Google と Discord の OAuth プロバイダー、メールリンク、認証コールバック URL は Supabase 側で設定してください。リバースプロキシや公開 URL を変更した場合は Supabase の許可リダイレクト先も合わせて設定します。

Google と Discord の具体的な設定手順は `./docs/oauth-setup.md` を参照してください。

### メール認証の設定

Supabase の **Authentication → Email Templates** で、**Confirm signup** に `./supabase/templates/confirm-signup.html`、**Magic Link** に `./supabase/templates/magic-link.html` の内容をそれぞれ設定します。リンク先では確認画面だけを表示し、本人がボタンを押した時に初めてワンタイムリンクを検証します。メールサービスの自動アクセスによってリンクが消費されるケースを減らすための設定です。これらのテンプレートを設定しない限り、この確認画面は使われません。

Supabase の **Authentication → URL Configuration** の Site URL をアプリの URL に合わせます。同じ PC のローカル開発では `http://localhost:3000` です。OAuth のリダイレクト先として `http://localhost:3000/auth/callback` を許可し、本番では対応する HTTPS の URL を登録してください。メールを開く端末の `localhost` はその端末自身を指すため、別端末からローカル PC のアプリには接続できません。

古いリンク、すでに使用したリンク、新しいメールの送信によって無効になったリンクは再利用できません。ログイン画面からメールを再送し、最新のメールを開いてください。メールのリンクにアクセスするセキュリティスキャナーや、メール配信事業者のリンク追跡によっても認証に失敗することがあります。

## Supabase のセットアップ

共有済みの `members`、`events`、`event_attendances`、`bingo_submissions`、`ir_submissions`、`ir_snapshots` と各 ENUM、RLS、認証トリガー、`bulk_upsert_members(payload jsonb)` が必要です。`proofs` は公開 Storage バケットとし、指定の RLS を設定します。イベントの `pending` 申請と、役員による参照・承認・却下のポリシーも必要です。

**最終発表の前に**、`./supabase/migrations/202611060001_publish_snapshot.sql` を Supabase に適用してください。`publish_event_snapshot` RPC は、役員の確認後、最終スナップショットの保存と `approved` → `published` を一つのトランザクションで実行します。既存の公開済みイベントに最終スナップショットがない場合は、役員が後から作成できます。重複する最終発表は拒否します。アプリからはログイン中ユーザーのセッションを使い、RLS を適用します。

## ロールと権限

| 操作 | 未ログイン | 部員 | 役員 | サークル長 |
| --- | --- | --- | --- | --- |
| 公式サイト・公開結果・公開画像を見る | ○ | ○ | ○ | ○ |
| イベント企画、出欠、自分のビンゴ・IR 提出 | — | ○ | ○ | ○ |
| 公開された中間・最終発表を見る | — | ○ | ○ | ○ |
| イベント承認・却下、参加分析、Discord リマインド | — | — | ○ | ○ |
| IR 発表・全提出ログ CSV、ビンゴ最終発表、自由企画ハイライト公開 | — | — | ○ | ○ |
| メンバー一覧 CSV の出力 | — | — | ○ | ○ |
| 他メンバーのロール変更 | — | — | 部員・役員間のみ | 自分以外の全ロール |
| メンバー追加・CSV 取込・承認・拒否・削除 | — | — | — | ○ |

ポータルは `active` の部員のみ利用できます。事前登録済みのメールアドレスは初回認証時の DB トリガーにより有効化され、それ以外は承認待ちになります。

## メンバー CSV

UTF-8 で次の6列を用意します。最大 500 件、1MB 以下。取込前にプレビューを表示します。

```csv
email,display_name,grade,role,main_games,discord_user_id
example@example.com,サンプル,2,member,太鼓の達人;CHUNITHM,123456789012345678
```

- `email` と `display_name` は必須。メールアドレスは重複不可。
- `grade` は 1〜6 または空欄、`role` は `member`・`executive`・`leader`。
- `main_games` は半角 `;` で区切り、`discord_user_id` は任意。自分自身のロールは CSV から変更できません。
- 取込は `email` をキーに単一 RPC で実行し、既存の `user_id` と `status` を維持します。新規行は事前登録扱いです。
- 出力は BOM 付き UTF-8 です。Excel の数式として解釈される文字列は安全のため先頭にアポストロフィを付けます。

## イベント・集計の仕様

企画申請の日時は日本時間で入力し UTC で保存します。`events.config` の形式と参加率・休眠者の計算方法は `./docs/phase2.md` を参照してください。

ビンゴは達成マスの縦・横・斜めを集計し、1マス不足のラインをリーチとします。IR は同じ部員・機種・曲名・難易度ごとの最高スコアを採用します。同点は同順位、各曲のポイントは「その発表の参加人数 − 曲別順位 + 1」で、未提出曲は 0 点です。総合順位はポイント合計で決めます。スコアの異なる機種を単純に足し合わせません。

公開結果には、その時点の最終スナップショットを表示します。一般閲覧者はビンゴ提出テーブルを直接参照できないため、ビンゴのランキング公開にも役員による最終発表が必要です。自由企画はイベント概要と、役員がイベント詳細から保存したハイライトを表示します。

## 画像・AI・通知の運用上の注意

- 証跡画像は JPEG / PNG / WebP、4MB 以下。`proofs` は公開バケットなので URL を知る人は閲覧できます。IR の画像は Gemini に送信されます。機密情報を含めないでください。
- AI の読み取りには誤りがあり得ます。課題曲との一致、スコア・判定の形式、実況の長さをサーバーで検証しますが、提出者は履歴を確認してください。画像の解析に失敗した場合は提出しません。
- 送信中は各画面のボタンを無効にしますが、これは全ユーザー・全サーバーを横断する 15 RPM の厳密な制限ではありません。必要な場合は共有ストアや API 側でレート制限を設けてください。
- 現在の RLS は有効部員が IR 提出ログを閲覧でき、本人の提出行を直接書き換えることも許可します。アプリ画面では発表前の全体ランキングを表示しませんが、DB API に対する秘匿やスコアの改ざん防止は保証できません。競技の厳密性が必要な場合は DB 権限や検証方法の見直しが必要です。
- `proofs` の現在の RLS は有効部員にオブジェクトの更新・削除を許可するため、他人の画像への操作も許可する設定かを運用側で確認してください。所有者単位の分離が必要な場合は Storage ポリシーを見直してください。
- 画像保存後に DB 応答を確認できない場合、参照のないファイルが残ることがあります。誤って登録済み画像を消さないよう、アプリは不明な結果に対して自動削除しません。
- 最終発表は DB 内でトランザクションとして確定します。Discord への送信はその後に行うため、通知失敗で公開自体は取り消されません。送信状況は画面に表示します。
- IR のスコア集計は公開 RPC の直前に複数ページを読み取り、基準時刻を記録します。読み取りと公開は別トランザクションのため、同時に確定・更新された提出が発表に反映されない場合があります。厳密な締め切り保証が必要な場合は、提出受付の停止と集計を DB 側の同一トランザクションで行う仕組みが別途必要です。
