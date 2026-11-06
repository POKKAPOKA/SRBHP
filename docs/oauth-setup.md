# Google・Discord ログインの設定

このアプリのログインボタンと Supabase Auth への接続処理は実装済みです。利用するには、各サービスで OAuth アプリを作成し、クライアント ID とシークレットを Supabase に登録してください。シークレットをリポジトリやチャットに貼り付けないでください。

## 共通: 2種類の戻り先

設定する URL は2種類あります。`localhost` でアプリを開いていても、このプロジェクトはクラウドの Supabase Auth を使います。

1. **Google / Discord に登録する URL**: Supabase ダッシュボードの **Authentication → Sign In / Providers** で各プロバイダーを開き、表示される **Callback URL** をコピーします。通常は `https://<プロジェクト参照ID>.supabase.co/auth/v1/callback` です。Google と Discord には、表示された値をそのまま登録してください。
2. **Supabase の URL Configuration に登録する URL**: アプリが動く PC でのテストなら、Site URL に `http://localhost:3000`、Redirect URLs に `http://localhost:3000/auth/callback` を登録します。本番では実際の HTTPS ドメインの `/auth/callback` も追加します。

Google / Discord の登録先は Supabase の Callback URL で、アプリの `http://localhost:3000/auth/callback` ではありません。ポート、`http` / `https`、末尾の文字まで一致させてください。

## Google

1. [Google Cloud Console](https://console.cloud.google.com/) で対象の Google Cloud プロジェクトを選ぶか作成します。
2. **Google Auth Platform** でアプリ名、サポートメール、対象ユーザーなどの必要事項を設定します。テスト中のアプリでは、ログインに使用する Google アカウントをテストユーザーとして追加します。
3. **Clients（クライアント）** から OAuth クライアントを作成し、アプリケーションの種類は **Web application（ウェブ アプリケーション）** を選びます。
4. **Authorized JavaScript origins** に `http://localhost:3000` を追加します。**Authorized redirect URIs** には、上の手順でコピーした **Supabase の Callback URL** を追加して作成します。
5. 発行された Client ID と Client Secret を、Supabase の **Authentication → Sign In / Providers → Google** に入力し、Google を有効にして保存します。

基本の認証に必要な権限については、[Supabase の Google 設定ガイド](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)を参照してください。テストの対象者や公開設定は Google 側の状態に従います。

## Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) で **New Application** を作成します。
2. そのアプリの **OAuth2** を開き、**Redirects → Add Redirect** に Supabase の Discord 設定画面からコピーした **Callback URL** を追加し、保存します。
3. 同じ OAuth2 画面で Client ID と Client Secret を確認します。シークレットの表示・再生成時に Discord が本人確認を求める場合があります。
4. Supabase の **Authentication → Sign In / Providers → Discord** に Client ID と Client Secret を入力し、Discord を有効にして保存します。

詳細は [Supabase の Discord 設定ガイド](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord)を参照してください。

## 動作確認とアカウント

- まず既存のログイン状態を残せるよう、プライベートウィンドウなどで同じアプリ URL を開き、各ログインを別々に試します。
- メールログインで利用したアドレスと Google / Discord の確認済みメールアドレスが同じ場合、Supabase は条件を満たすと同じユーザーへ自動リンクします。アドレスが異なる場合は別ユーザーになり、承認待ちとなることがあります。既存のサークル長アカウントを削除しないでください。
- 別のメールアドレスを同じユーザーに手動連携する機能は、現状のアプリにはありません。必要な場合は安全な連携フローを追加してください。
- Discord でログインしただけでは、`members.discord_user_id` は自動で登録されません。Discord リマインドが必要な場合は、サークル長がメンバー管理の CSV 一括取込などで該当 ID を登録します。
- `provider is not enabled` は Supabase 側のプロバイダーが無効な場合に表示されます。`redirect_uri_mismatch` は Google / Discord 側に登録した Supabase Callback URL、アプリに戻れない場合は Supabase 側の Redirect URLs を確認します。
