# ディレクトリ・アーキテクチャ設計

## 1. 方針

GitHub Pagesで配信する静的ファイルだけで閲覧機能を成立させる。ブラウザは相対URLでJSONを取得し、ES Modulesが画面を構築する。Node.jsは公開時に常駐せず、データ同期・検証・補助生成にだけ使用する。

## 2. 計画ディレクトリ

```text
.
├── .github/                         # Actions実装時に追加
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── sync-data.yml
│   │   └── deploy-pages.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── site/                            # Pages成果物の正本
│   ├── index.html
│   ├── 404.html
│   ├── assets/
│   │   ├── css/
│   │   ├── js/
│   │   │   ├── app.js
│   │   │   ├── api/                # JSON読込。実サーバーAPIではない
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   └── utils/
│   │   └── images/
│   └── data/
│       ├── index.json
│       ├── competitions.json
│       ├── teams.json
│       ├── sources.json
│       ├── seasons/
│       ├── matches/
│       ├── standings/
│       ├── players/
│       ├── stats/
│       └── search/
├── scripts/
│   ├── sync/
│   │   ├── index.js
│   │   ├── sources/                 # 情報源別Cheerioアダプター
│   │   └── lib/                     # fetch、正規化、差分等
│   └── validate/
│       ├── index.js
│       ├── schema.js
│       ├── references.js
│       └── football-rules.js
├── schemas/                         # JSON Schemaまたは同等仕様
├── data/
│   ├── raw/                         # 一時取得物。Git/Pages対象外
│   └── fixtures/                    # 合成・匿名化した同期テスト入力
├── tests/
│   └── e2e/
├── docs/
│   └── adr/
├── PROJECT_SPEC.md
├── README.md
├── package.json
└── playwright.config.js             # E2E実装時に追加
```

## 3. 実行時の流れ

```text
GitHub Pages/CDN
  ├─ HTML
  ├─ CSS
  ├─ ES Modules
  └─ JSON
       ↓ fetch（相対URL）
     Browser → DOM描画 / 検索 / 絞り込み
```

サーバーAPI、DB接続、実行時Node.jsは存在しない。JavaScriptはJSONを読み取り、DOM APIで描画する。外部由来文字列はHTMLとして挿入しない。

## 4. データ更新の流れ

```text
Official source
  → scripts/sync/sources/*
  → normalize
  → scripts/validate/*
  → site/data/*.json
  → Pull Request review
  → main
  → GitHub Pages
```

情報源別のHTML構造はアダプター内部に閉じ込め、共通の正規化オブジェクトを出力する。表示コードは情報源固有のセレクタや形式を知らない。

## 5. モジュール境界

- `site/assets/js/api`: JSONのURL解決、fetch、schemaVersion確認、キャッシュ。
- `site/assets/js/pages`: URLと画面単位の組み立て。
- `site/assets/js/components`: DOM要素を受け取り描画する小さな部品。
- `site/assets/js/utils`: 日付、得点、文字列等の副作用の少ない処理。
- `scripts/sync/sources`: 情報源固有の取得・抽出。
- `scripts/sync/lib`: ID解決、正規化、安定ソート、JSON出力。
- `scripts/validate`: 公開前に止めるべきデータ異常の検出。

ブラウザ用モジュールからNode.js専用モジュールをimportしない。同期処理からDOM表示コードをimportしない。

## 6. URL設計

GitHub Pagesのサブパスで動くことを必須とする。`/assets/...` や `/data/...` のようなoriginルート絶対パスは避ける。

初期は単一HTMLとクエリパラメータを用いる。

- `./?view=matches&date=2026-05-10`
- `./?view=competition&id=competition-id`
- `./?view=match&id=match-id`
- `./?view=team&id=team-id`

静的HTMLを画面ごとに生成する方式は、SEOとデータ規模を計測してからADRで再検討する。

## 7. 環境

| 環境 | 内容 |
| --- | --- |
| local | 静的HTTPサーバーで `site/` を配信し、合成JSONを使用 |
| preview | Pull Request artifactまたはPages相当の一時配信 |
| production | mainの検証済み `site/` をGitHub Pagesへ配信 |

`file://` 直開きはfetch制約があるためサポートせず、ローカルでもHTTPで確認する。

## 8. ADR対象

- GitHub Pagesの公開方式と独自ドメイン
- JSONの分割しきい値と過去シーズンの配置
- 同期Pull Request作成Botの権限
- ルーター方式と静的HTML生成の必要性
- PWA・Service Worker導入判断
- JSON Schema検証ライブラリ追加判断

