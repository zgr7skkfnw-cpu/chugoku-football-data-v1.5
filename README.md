# Chugoku Football Data

中国地方の大学サッカーを対象とした、試合・順位・チーム・選手情報の静的Webアプリです。HTML、CSS、JavaScript（ES Modules）とJSONだけでGitHub Pages上に公開します。

> Phase 5まで実装済みです。公開日程・結果、選手データベース、チーム／シーズン分析、順位推移、マイチーム機能を利用できます。

今後の機能、データ可否、対象外項目、完了条件は [Master Development Specification v1.0](PROJECT_SPEC.md) を基準とします。

## 技術構成

- HTML / CSS
- JavaScript（ES Modules）
- JSONファイルによる公開データ管理
- Node.jsによる同期・検証スクリプト
- Cheerioによる許可済みHTML情報源の解析
- PlaywrightによるE2Eテスト
- GitHub Actions / GitHub Pages

Next.js、FastAPI、PostgreSQLは使用しません。実行時サーバーやAPIも持ちません。

## 設計ドキュメント

- [プロジェクト仕様](PROJECT_SPEC.md)
- [ディレクトリ・アーキテクチャ設計](docs/ARCHITECTURE.md)
- [開発ロードマップ](docs/ROADMAP.md)
- [使用技術](docs/TECH_STACK.md)
- [JSONデータ構造設計](docs/DATA_MODEL.md)
- [GitHub Actions設計](docs/GITHUB_ACTIONS.md)

## ディレクトリ構成

```text
.
├── site/                    # GitHub Pagesへ公開する静的ファイル
│   ├── assets/
│   │   ├── css/             # スタイルシート
│   │   ├── js/              # ブラウザ用ES Modules
│   │   └── images/          # ロゴ・画像
│   └── data/                # 公開用JSONデータベース
├── scripts/
│   ├── build/               # 公開用の集計済み分析JSON生成
│   ├── sync/                # Node.jsデータ同期処理
│   └── validate/            # JSON・参照整合性検査
├── schemas/                 # JSONデータ仕様
├── data/
│   ├── raw/                 # ローカル一時原本（公開・Git管理しない）
│   └── fixtures/            # 匿名化・合成した同期テスト入力
├── tests/                   # Playwright E2Eテスト
├── docs/                    # 設計・ADR
├── PROJECT_SPEC.md
└── package.json
```

## データ更新の考え方

```text
情報源 → Node.js/Cheerio → JSON検証 → Pull Request → レビュー → GitHub Pages
```

ブラウザは `site/data/` のJSONを読み取るだけです。同期スクリプトは許可された情報源だけを対象とし、同期結果は直接公開せず、差分レビューを通します。

## 現在の実装範囲

- 静的Web向けディレクトリ
- 同期、検証、E2E用ディレクトリ
- ES Modules、Node.js、Cheerio、Playwrightを定義する `package.json`
- ダークテーマのレスポンシブUI
- ホーム、試合、順位表、チーム、選手、ランキングの6画面
- 下部ナビゲーションとHistory APIベースの画面遷移
- 最小の状態管理、UI部品、画面別ES Modules
- JUFA中国ページからiframe URLを取得する結果同期
- football-systemの一覧HTMLと詳細POSTを解析するCheerio処理
- Playwright HTTP Request Contextだけを使った全90試合の日程と44試合の公開済み詳細取得
- `site/data/seasons/2026/matches.json` への試合JSON出力
- `fetch()` による試合JSONの読込とstate共有
- 最新試合、全試合、公開記録から計算する順位表
- 公開記録から生成するチーム、得点選手、ランキング
- 試合カードから遷移できる試合詳細（得点、スタメン、交代、警告・退場、審判、会場、観客数、前後半スコア）
- JUFA中国チームページからの集合写真、エンブレム、スタッフ、登録選手同期
- `site/data/teams.json` と `site/data/players.json` によるチーム・選手情報の一元管理
- チーム写真、順位、勝点、得失点差を表示するチームカード一覧
- 集合写真、エンブレム、キット、基本情報、スタッフ、SNS、登録選手を表示するチーム詳細
- 試合一覧・詳細・順位表・スタメンへのエンブレムとミニユニフォーム連携
- 登録選手と試合ラインナップの氏名・背番号・ポジション監査
- 登録507選手の一覧・検索・チーム／ポジション／推定学年フィルター
- 選手詳細、チームカラーのイニシャル、所属チーム・試合・ランキング間の相互リンク
- 公開試合記録から集計する出場、先発、ベンチ入り、出場時間、交代、得点、アシスト、警告・退場
- 第1〜9節を前期、第10〜18節を後期とした選手成績の期間切り替え
- 順位表、選手ランキング、チーム順位・成績の通算／前期／後期切り替え
- 得点、アシスト、G+A、出場、時間、先発、ベンチ、フル出場、途中出場、カードの11ランキング
- チーム・推定学年による選手ランキング絞り込み
- ホーム／アウェイ成績、直近5試合、年度・試合日・リーグ名・ステージ名を区別した通算H2H、チーム内ランキング
- 平均得失点、クリーンシート、無得点、カード、ベンチ、平均先発年齢のチームランキング
- 第1節〜最終節を横軸、1位を上にしたレスポンシブ順位推移グラフ
- 期間、終了／未開催、チーム、ホーム／アウェイを組み合わせる試合フィルター
- チーム名、会場、日付、節の試合検索と中止・延期・中断表示
- 通算／ホーム／アウェイ順位、勝率、前節比の順位変動
- リーグ画面の1部／2部切替と、試合画面の日付別「フォロー中・1部・2部」グループ表示
- 2026／2025年度切替、2025年度1部・2部・2部プレーオフ・入替戦の表示
- `site/data/seasons/index.json` を基準にした年度・リーグ・ステージ別の読込定義
- `team-stats.json` による同期時の分析結果事前生成
- チームページの背番号順選手一覧、試合詳細のスタメン・ベンチ・得点者リンク
- ホームまたはチーム詳細からのマイチーム登録と、次戦・最新結果・順位の優先表示
- 選手JSONの必要画面だけでの遅延読込と、JSONごとのPromiseキャッシュ
- Lazy Load、JSONの単一読込キャッシュ、History APIによる再取得なしの画面遷移
- ローディング表示とJSON取得エラー表示
- Playwrightによる主要画面、相互リンク、マイチーム、Console Error 0件のE2E確認

依存パッケージは導入済みで、lockfileを管理します。`npm run sync` で2026年度1部、`npm run sync:div2` で2026年度2部の結果を同期できます。ブラウザは生成JSONを読み取って全画面を構築します。UIサンプル用の仮チーム・仮選手データは残していません。

年度単位の構成は `site/data/seasons/{年度}/` とし、`season.json` がカテゴリごとの参加チームと試合JSONを参照します。大学の同一性は `site/data/team-catalog.json` で一元管理し、周南公立大学の旧称「徳山大学」のような過年度名は `aliases` に保持します。会場の名称変更は `site/data/venue-catalog.json` で関連付けますが、試合詳細は各年度の記録名をそのまま表示します。

`npm run sync`、`npm run sync:div2`、`npm run sync:teams` は同期後に対戦成績の派生データ `site/data/head-to-head.json` を再生成します。`npm run sync` は1部、`npm run sync:div2` は2部、`npm run sync:teams` は1部のチーム分析JSONも再生成します。分析JSONだけを再生成する場合は `npm run build:stats` または `npm run build:stats:div2`、対戦成績だけは `npm run build:h2h` を使います。ブラウザは順位表を試合ごとに再計算しません。

2025年度は次のコマンドで大会ごとに再同期できます。通常リーグの同期では順位・チーム分析も再生成されます。最後に `npm run build:seasons` で年度索引だけを再生成できます。

```bash
npm run sync:2025:div1
npm run sync:2025:div2
npm run sync:2025:playoff
npm run sync:2025:relegation
npm run build:seasons
```

チームプロフィールと登録選手は `npm run sync:teams` で同期します。同期時に
`site/data/player-audit.json` も生成され、試合ラインナップと登録名簿の差異を確認できます。

学年は掲載値を優先し、掲載がない場合は公開された生年月日と日本の学年区分（4月2日〜翌4月1日）から推定します。画面では「推定学年」と明記し、標準的な1〜4年の範囲外は`null`とします。出身地など、推定を許可していない未掲載値は`null`で保持します。

## ローカル確認

```bash
npm install
npm run dev
```

`http://localhost:4173/` を開きます。データ検証とE2Eテストは次のコマンドで実行できます。

```bash
npm run validate:data
npm run test:e2e
```

## 開発前に確定すること

1. 初期対象大会と許可された情報源を決める。
2. 選手情報・写真・試合記録の公開範囲を合意する。
3. 実データサンプルでJSON構造と順位規則を検証する。
4. GitHub PagesのURL、独自ドメイン、公開リポジトリ方針を決める。
