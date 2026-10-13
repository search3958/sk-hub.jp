# _build — サイトのページを作る元ファイル

`_` で始まるフォルダなので、GitHub Pages では公開されません（リポジトリにだけあるファイルです）。

## ページを作り直す

```
python _build/build.py
```

- 型は **トップページの `index.html`** です。`<main id="main">` の外側（`<head>`・ヘッダー・フッター）が全ページ共通になります。
- 各ページの中身は `_build/pages/*.html` です。ページを直すときは、ここを編集してから build します（書き出された `about/index.html` などを直接直しても、次の build で上書きされます）。
- トップページだけは `index.html` を直接編集します（編集したら build して、ほかのページのヘッダー・フッターにも反映します）。
- ページの一覧・タイトル・説明・追加で読み込むファイルは `build.py` の `pages` と `EXTRA` にあります。
- `sitemap.xml` も build で作り直されます。

## 共有画像（assets/og.png）を作り直す

```
python _build/og/render.py
```

`_build/og/og.html` を Microsoft Edge で撮影して `assets/og.png` に保存します。

## 多言語（日本語・英語・中国語・韓国語）

URL は変えずに、`/lang/` で選んだ言語でページを訳して表示します（`assets/i18n.js`）。

- 訳は `_build/i18n/<言語>.json`（キーが日本語の文）。build すると `assets/i18n/<言語>.js` が作られます。
- build が訳のない文を見つけると `_build/i18n/missing/<言語>.json` に書き出すので、訳を JSON に足してもう一度 build します。
- build で作らないページ（MALU など）とスクリプトの `t("…")` も、`build.py` の `STANDALONE_PAGES`・`RUNTIME_SOURCES` に入れておけば探します。
- SK's Lab（QR Drop・スマートダッシュボード）は日本語と英語だけです（`<html data-i18n-langs="ja en">`。ほかの言語を選んでいると英語で出る）。英訳は `en.json` にだけ入れ、`build.py` の `EN_ONLY_PAGES` で探します。

## サポートの記事・お知らせ

記事は **記事エディター（https://sk-hub.jp/studio/）** で書きます。保存すると SK Hub Systems に入り、サポートページにすぐ出ます（build もプッシュもいりません）。

- `support/articles.json` は予備です（SK Hub Systems に記事が 1 件もない・届かないときだけ使われる）。記事エディターの「バックアップを書き出す」で作ったファイルと入れ替えてプッシュすると、予備も新しくなります。
- 読み込みと本文の書き方は `support/articles.js` にまとめています。

## 規約を変えるとき

- 規約の文は `policies/docs/<名前>.txt`（日本語が正式）と、訳の `<名前>.<言語>.txt`（en / zh-CN / zh-TW / ko）です。日本語を直したら、訳も同じように直します。
- `sk-hub-systems.txt`・`y-filter.txt`・`newtab.txt` は、y-filter リポジトリの `policy/` がもとです（`systems/sync-console.mjs` でコピー）。y-filter 側も同じように直します。
- 取り扱う情報を増やすときは、`assets/hub/account.js` の `ACCOUNT_TERMS_VERSION` を上げると、次に使うときに同意し直してもらえます。附則に改定の記録を足します。

## SK Hub Systems の運用メモ

- **2 年以上ログインのないアカウント**（アカウント規約 第五条4）: Firebase コンソールの Authentication →「ユーザー」で「ログイン日時」の古い順に並べて確認します。削除するときは、先にそのユーザーの UID で Firestore の `accounts/<UID>`（とその下の `notices`・`maluWords`・`malu`）と、持ち主の管理グループ（`teams/<UID>`・`ownerUid` が同じ `devices`・`requests`・`pairingCodes`）を消してから、Authentication のユーザーを削除します。サーバーで動く処理（Cloud Functions）は無料プランでは使えないため、自動にはしていません。
- **お問い合わせ・アクセスチェックの記録の保存期間**: 開発者が `/inbox/` を開いたときに、期限を過ぎたものを削除します。ときどき開いてください。
- **Firestore のルール**: y-filter リポジトリの `systems/firestore.rules`。`systems` で `firebase deploy --only firestore:rules` で反映します。
- **Google アナリティクス**: 測定 ID `G-LLN7RGHRTE`（アカウント「Default Account for Firebase」→ プロパティ「y-filter-system」→ データストリーム「SK」）。読み込みは `assets/analytics.js`（許可した人だけ）。プライバシーポリシー第四条の二に合わせて、データの保持は 2 か月、Google シグナルはオフ、拡張計測機能の「サイト内検索」「フォームの操作」はオフにしています。変えるときはポリシーも直します。
- **SK Share（/view/）**: パスワードを入れると、YouTube の限定公開動画・HTML 文書・Google ドライブのファイル（PDF・ドキュメント・スライド・フォルダなど）を見られるページです。作る・直す・止めるのは `/view/editor/`（開発者だけ）。データは Firestore の `viewPages`（ID = パスワードから作った値。くわしくは `view/view-core.js` と y-filter リポジトリの `systems/firestore.rules`）。One UI 版の試作は `_mockups/view-oneui/`（配信しない）。
- **`google4b04249061c7d95f.html`（サイトの一番上）**: Google Search Console で sy9-k.github.io の持ち主であることを示すファイルです。Google のログイン画面に「SK Hub Systems」と出すためのブランドの確認に使うので、消さないでください。

## build で作らないページ

次のページは、それぞれのフォルダのファイルを直接編集します。

- `index.html`（トップ）
- `dictionary/`（MALU）
- `y-filter/`（Y-FILTER. 管理コンソール。共通部分は y-filter リポジトリの `systems/sync-console.mjs` でコピー）
- `qr-prj/`・`smart-dash/`（SK's Lab）
- `news/`（サポートへの転送）・`usercheck/`（同意・アクセス制限の画面）
- `view/`（SK Share。マテリアルデザイン）・`view/editor/`（SK Share の管理・開発者用）
