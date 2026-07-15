# 開発ロードマップ

GitHub Pages上の静的Webアプリとして、小さなデータセットから段階的に構築する。期間は目安であり、各Phaseの完了条件を優先する。

[Master Development Specification v1.0](../PROJECT_SPEC.md) を機能要件の正本とする。

## Master Specification準拠ロードマップ

### Phase 6: 仕様適合・順位／試合強化

- 推定学年を全画面で「推定」と明示し、将来の掲載学年を優先できる設計を維持（完了）
- 中止・延期・中断の掲載状態解析（完了）
- 試合検索（完了）
- ホーム順位、アウェイ順位、勝率（完了）
- 前節比の順位変動（↑↓→）（完了）

### Phase 7: 選手・ランキング・記録分析

- ベンチ外の算出条件と登録期間の確定
- 先発、ベンチ入り、フル出場、途中出場ランキング（完了）
- チーム別選手ランキング
- 得点・失点時間帯
- シーズン記録、連勝・無敗記録

### Phase 8: 検索・会場・審判

- チーム・試合・会場の横断検索
- 会場ページと開催試合一覧
- 許諾済み写真、地図、アクセス
- 主審ページ、担当試合、カード平均

### Phase 9: 複数年度・大学サッカーアーカイブ

- 年度別選手・チーム成績
- 歴代順位、得点王、アシスト王
- 卒業生、OB、新入生、卒業予定選手
- 複数年度H2H

### Phase 10: PWA・端末内ユーザー機能

- お気に入り選手、最近見た試合・選手
- ホーム画面カスタマイズ
- PWA、インストール、限定オフライン
- 端末内リマインダーとデータ更新通知

MVP、ベストイレブン、注目選手・試合は、主催者発表または公開済みの運営選定基準が整うまで実装しない。シュート、CK等の分析は提供データが取得可能になるまで実装しない。

## Phase 0: 静的構成への再設計（完了）

- HTML/CSS/JavaScript、JSON、Node.js同期、Cheerio、Playwrightへ技術構成を変更
- サーバーAPI、DB、実行時認証を対象外に変更
- JSON更新とGitHub Pages公開フローを設計
- 静的Webに合わせて仕様・データ・Actions設計を更新

## Phase 1: プロジェクト骨格（着手）

### Step 1A: ディレクトリとパッケージ定義（完了）

- `site/`、`site/assets/`、`site/data/` を作成
- `scripts/sync/`、`scripts/validate/`、`schemas/` を作成
- `data/fixtures/`、`tests/e2e/` を作成
- ES Modules、Node.js、Cheerio、Playwrightを定義した `package.json` を作成

### Step 1B: 最小静的画面（完了）

- セマンティックな `index.html`
- デザイントークンとモバイル優先CSS
- `app.js` と相対URLによるモジュール読込
- 読込中、空、失敗状態の表示
- GitHub Pagesのサブパス動作確認

実装では6画面のUI、下部ナビゲーション、History APIルーター、最小state、ダークテーマ、レスポンシブレイアウトまで作成した。JSONデータ取得は行わず、画面内の値はUI確認用ローカル定数としている。

### Step 1C: 最小JSONと検証（次回）

- `site/data/index.json` と合成サンプル
- schemaVersion、必須キー、ID参照の検証
- 安定したJSON整形・ソート
- ローカル静的配信と検証コマンド

### 完了ゲート

依存関係を再現可能に導入でき、サンプルJSONから試合一覧を表示し、検証と最小Playwrightテストがローカルで成功する。

## Phase 2: 閲覧MVP（3〜5週間）

### 公開結果同期（完了）

- JUFA中国ページからfootball-systemのiframe URLを解決
- `table.game_schedule` と `gamedetail(...)` の識別子をCheerioで解析
- Playwright HTTP Request Contextによる詳細POST
- 44試合以上の試合JSONを `site/data/seasons/2026/matches.json` に生成
- 取得件数、変更件数、エラー数の同期サマリーと安全な上書き条件

この時点では生成JSONを既存UIへ接続せず、画面変更は行わない。

- 日付別試合一覧と状態フィルター
- 大会、シーズン、順位表
- 試合詳細と主要イベント
- チーム詳細と登録選手
- 得点ランキング
- クライアントサイド検索索引
- ローディング、空データ、破損JSON、404相当の状態
- レスポンシブ、キーボード操作、Playwright/axe検査

### 完了ゲート

1大会・1シーズン分の合成データを、主要モダンブラウザとGitHub Pagesのサブパスで閲覧できる。

## Phase 3: 同期・データ品質（3〜5週間）

### 公開データUI接続（完了）

- `matches.json` をブラウザの `fetch()` で取得
- ホームの最新試合と全試合一覧を公開記録へ置換
- 勝点、得失点差、総得点による順位表を生成
- チーム、得点選手、ランキングを同じ試合JSONから派生
- 試合カードから試合詳細へ遷移
- ローディング状態と取得エラー状態を実装
- UIサンプル用データを削除

- 初期情報源の利用条件と更新頻度を文書化
- Node.js fetchとCheerioによる情報源別アダプター
- fixtureベースの抽出テスト
- 表記正規化、安定ID、重複検出
- スコア・イベント・順位の整合性検査
- 変更件数のしきい値と差分要約
- 手動実行・失敗復旧手順

### 完了ゲート

許可済みの1情報源から、既存正常データを壊さず、レビュー可能なJSON差分を再現して生成できる。

## Operations A: GitHub Actions / Pages（2〜3週間）

> 注: アプリ機能開発上のPhase 4（選手DB）とPhase 5（チーム分析）は実装済み。以下は今後の運用基盤ロードマップ。

- PRのJSON検証、静的検査、Playwright
- 定期・手動同期とPull Request作成
- mainからGitHub Pagesへの提供Actionによる公開
- Pages artifactと公開内容のsmoke test
- dependency review、CodeQL、secret scanning
- concurrency、権限、失敗通知、Runbook

### 完了ゲート

同期データはレビューなしに公開されず、mainの正常な静的ファイルだけがPagesへ反映される。

## Operations B: 限定公開・品質改善（2〜4週間）

- 実データ照合と大会規定の例外検証
- Core Web Vitals、JSONサイズ、キャッシュの測定
- SEO、OGP、サイトマップ、404
- アクセシビリティ監査
- 利用規約、プライバシー、訂正・削除窓口
- 同期失敗、誤データ、Pages障害の訓練

### 完了ゲート

運営者の承認、重大既知不具合ゼロ、MVP完了条件達成。

## 継続改善（旧バックログ）

- お気に入りのlocalStorage保存
- PWA・限定オフライン対応
- 対戦履歴、フォーム、比較、可視化
- 大会・シーズン追加
- RSS/Atom等の静的フィード
- 必要な場合のみ静的HTML事前生成を再評価

## 初期バックログ優先順

1. 最小HTML/CSS/ES Modules
2. JSON indexと合成試合データ
3. JSON読込、エラー処理、試合一覧
4. データ構造・参照整合性検証
5. Playwright smoke test
6. 大会、順位、試合詳細、チーム
7. Cheerio同期アダプター
8. GitHub ActionsとPages公開
9. 検索、性能、SEO、アクセシビリティ
