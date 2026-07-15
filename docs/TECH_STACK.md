# 使用技術

## 1. 採用技術

| 領域 | 技術 | 用途 |
| --- | --- | --- |
| マークアップ | HTML | セマンティックな静的文書、SEO、アクセシビリティ |
| スタイル | CSS | モバイル優先レイアウト、デザイントークン、レスポンシブ表示 |
| ブラウザ処理 | JavaScript（ES Modules） | JSON読込、DOM描画、検索、絞り込み |
| 公開データ | JSON | リポジトリで履歴管理する読み取り専用データベース |
| 同期ランタイム | Node.js | データ取得、正規化、検証、JSON生成のみ |
| HTML解析 | Cheerio | 利用許可を確認した情報源のHTML解析 |
| E2E | Playwright | ブラウザ動作、サブパス、レスポンシブ、a11y検査 |
| 自動化 | GitHub Actions | PR検査、定期同期、Pages公開、セキュリティ検査 |
| 配信 | GitHub Pages | `site/` の静的ファイル配信 |
| バージョン管理 | Git / GitHub Pull Requests | データ差分、承認、訂正履歴 |

## 2. 使用しない技術

- Next.js、React等のUIフレームワーク
- FastAPI等のサーバーAPI
- PostgreSQL等の実行時データベース
- TypeScriptとトランスパイルを前提とする構成
- 実行時Node.jsサーバー
- Redis、ジョブキュー、コンテナ、Terraform

ブラウザ標準を優先し、初期実装ではbundle工程を持たない。

## 3. JavaScript方針

- `package.json` の `type: module` とブラウザの `<script type="module">` を使用する。
- import pathは明示的に `.js` を含める。
- DOM描画には `textContent`、`createElement`、属性の許可リストを使う。
- 外部由来HTMLを `innerHTML` へ渡さない。
- 日付保存はISO 8601、表示は `Intl.DateTimeFormat` を使う。
- URLとJSON参照はGitHub Pagesのサブパスを壊さない相対指定にする。
- 状態管理ライブラリは使わず、画面単位の小さなモジュールに保つ。

## 4. Node.js同期方針

- Node.jsは常駐サーバーではなく、終了するCLIスクリプトとしてのみ使う。
- 標準の `fetch`、`fs/promises`、`URL` を優先する。
- CheerioはHTMLの選択・抽出に限定し、情報源別アダプター内に閉じ込める。
- ネットワークを使うテストと抽出ロジックのテストを分離し、fixtureを使用する。
- タイムアウト、User-Agent、再試行上限、アクセス間隔を明示する。
- 抽出件数の急変、必須項目欠落、既存ID大量消失時は上書きしない。
- JSONはキーと配列を安定順にして差分を読みやすくする。

## 5. 依存関係

初期の直接依存はCheerioとPlaywrightに限定する。実装開始時にサポート中のNode.jsを選び、package-lockをコミットしてバージョンを固定する。JSON Schema validatorやアクセシビリティ補助ライブラリは、標準実装で複雑化する場合だけ追加する。

## 6. ローカル実行

ブラウザのfetchを使うため、`site/` は `file://` ではなくローカルHTTPサーバーで配信する。専用アプリサーバーは作らず、開発用の静的サーバーコマンドをpackage scriptとして用意する予定である。

## 7. セキュリティ

- GitHub Actionsの秘密情報を `site/`、artifact、ログ、JSONへ出力しない。
- 取得URLは情報源設定の許可リストからのみ組み立てる。
- fetch結果のContent-Type、サイズ、リダイレクト先を検証する。
- DOMへ外部文字列を挿入する際はHTMLとして解釈させない。
- 外部リンクには許可プロトコルを適用する。
- 依存更新、CodeQL、secret scanning、GitHub PagesのCSP可能範囲を検討する。

## 8. 再評価条件

次の場合は、静的構成の範囲内でJSON分割や事前HTML生成を先に検討する。

- JSON総量または単一ファイルが性能目標を継続して超える。
- クライアント検索が低性能端末で成立しない。
- SEO上、単一HTMLでは主要情報が十分発見されない。

ユーザー投稿、非公開管理画面、秒単位ライブ更新が必須になった場合は、現在の静的プロジェクトとは別のアーキテクチャ判断として扱う。

