# GitHub Actions設計

## 1. 方針

GitHub Actionsは、静的ファイルとJSONの検証、データ同期Pull Requestの作成、GitHub Pages公開に使用する。現在は設計のみで、workflow YAMLはPhase 4で実装する。

## 2. ワークフロー一覧

| 仮ファイル名 | トリガー | 目的 |
| --- | --- | --- |
| `ci.yml` | pull_request、mainへのpush | JS、JSON、リンク、Playwrightの検査 |
| `sync-data.yml` | schedule、workflow_dispatch | 許可済み情報源から同期しPRを作成 |
| `deploy-pages.yml` | mainへのpush、workflow_dispatch | 検証済み `site/` をGitHub Pagesへ公開 |
| `security.yml` | pull_request、週次schedule | dependency review、CodeQL、secret検査 |

## 3. CI

```text
changes
 ├─ static-check
 ├─ data-validate
 ├─ sync-fixture-test
 └─ playwright
       ↓
    ci-success
```

- frozen lockfileで依存を導入する。
- JavaScript構文と静的検査を行う。
- 全JSONの構造、ID、参照、競技整合性、安定順を検査する。
- Cheerioアダプターを保存済みfixtureに対して試験する。
- ローカル静的サーバーで `site/` を配信しPlaywrightを実行する。
- プロジェクトPages相当のサブパスでもassetとJSONを取得できるか確認する。
- 主要画面のconsole error、404、重大なアクセシビリティ違反を失敗条件にする。

## 4. データ同期

1. scheduleまたは手動で開始する。
2. 情報源ごとの利用許可・有効化設定を確認する。
3. Node.jsスクリプトで取得し、Cheerioで抽出する。
4. 一時領域にJSONを生成し、全検証を行う。
5. 件数、追加、変更、削除、警告をJob Summaryへ出す。
6. 変更が安全なしきい値内なら専用branchへcommitする。
7. BotがPull Requestを作成または更新する。
8. CODEOWNERSが出典と差分を確認し、承認後にmainへマージする。

同期ActionからmainやPagesへ直接pushしない。取得失敗、HTML構造変更、既存ID大量消失、空データ化の場合はPRを作らず失敗通知する。

## 5. GitHub Pages公開

GitHub提供のPages Actionをcommit SHAで固定して使用する。

1. mainをcheckoutする。
2. frozen lockfileで依存を導入する。
3. JSON検証と最小Playwright smoke testを再実行する。
4. `site/` だけをPages artifactとしてuploadする。
5. `github-pages` Environmentへdeployする。
6. 公開URLに対してHTML、ES Modules、`data/index.json` のsmoke testを行う。

公開物に `scripts/`、`data/raw/`、fixture、node_modules、ログ、秘密情報を含めない。ActionsのPages concurrency設定を使い、同時公開を直列化する。

## 6. 権限

| Workflow | 必要な権限 |
| --- | --- |
| CI | `contents: read` |
| Sync | `contents: write`、`pull-requests: write` |
| Pages | `contents: read`、`pages: write`、`id-token: write` |
| Security | 検査機能に必要な最小権限 |

ジョブ単位で明示し、デフォルトをread-onlyにする。fork PRへsecretを渡さず、`pull_request_target` でPRのコードを実行しない。

## 7. 秘密情報

- 公開情報だけの同期を基本とし、不要なsecretを作らない。
- 認証が正式に許可された情報源だけGitHub Environment secretsを使用する。
- 認証情報、Cookie、取得HTMLをログ、artifact、JSONへ含めない。
- Pagesへ公開するJavaScriptからsecretを参照しない。
- GitHub tokenをJSONや生成ファイルへ書き出さない。

## 8. キャッシュとArtifact

- Node.jsとpackage manager cacheはlockfileをキーにする。
- Playwright browserは提供元の推奨に従い、キャッシュ不整合を避ける。
- 失敗時のPlaywright traceは短期間だけ保存する。
- 同期の生HTMLは原則Artifact化せず、必要時も利用条件と個人情報を確認する。
- Pages artifactには `site/` のみを含める。

## 9. Branch protection

- mainへの直接pushを禁止する。
- `ci-success` を必須checkにする。
- `site/data/`、`scripts/sync/`、workflow変更はCODEOWNERSレビューを要求する。
- 承認後にcommitが追加された場合は再承認を要求する。
- Actions workflowと依存更新では第三者Actionのcommit SHA固定を確認する。

## 10. 失敗時の運用

| 失敗 | 対応 |
| --- | --- |
| 情報源取得失敗 | 現在の公開JSONを維持し、Issue/通知で確認する |
| HTML構造変更 | fixtureとアダプターを更新し、実データ差分を再確認する |
| JSON検証失敗 | 公開を止め、元データまたは正規化処理を修正する |
| Pages公開失敗 | 直前成功版は維持し、Actionを修正して再実行する |
| 誤データ公開 | 訂正PRを最優先し、必要なら正常commitを再公開する |
| secret漏えい | 即時失効、履歴・ログ調査、再発行、影響範囲確認を行う |

## 11. 実装順

1. `ci.yml` のJSON検証と静的検査
2. Playwright smoke test
3. `deploy-pages.yml`
4. Branch protectionとCODEOWNERS
5. `sync-data.yml` の手動実行
6. 同期PR自動作成
7. 定期scheduleとsecurity workflow
