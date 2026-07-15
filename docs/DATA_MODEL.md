# JSONデータ構造設計

## 1. 方針

`site/data/` をブラウザから読める公開用データベースとする。データはGitで履歴管理し、Pull Requestの差分を人がレビューできる形式にする。

- JSONだけを公開データの正本とする。
- `index.json` から各データセットの相対パスを解決する。
- 小さなマスタと、シーズン単位の大きな記録を分割する。
- ID、配列順、キー順を安定させて不要な差分を防ぐ。
- 正規化された事実と表示用派生データを区別する。
- 個人情報は公開してよい項目だけをJSONへ出力する。

## 2. ファイル配置

```text
site/data/
├── teams.json
├── team-catalog.json
├── venue-catalog.json
├── players.json
├── player-audit.json
└── seasons/{seasonId}/
    ├── season.json
    ├── matches.json
    ├── div2/matches.json
    └── team-stats.json
```

`team-catalog.json` は年度をまたぐチームID、現在の表示名、過年度名を管理する。`venue-catalog.json` は命名権などで名称が変わった同一会場と、区別すべきグラウンドを管理する。試合詳細では `matches.json` に記録された当時の会場名をそのまま表示し、会場カタログの現在名へ置換しない。`season.json` はその年度のカテゴリ、参加チーム、試合JSONへの参照を管理する。

リーグ戦、A・Bブロック、順位決定プレーオフ、昇格プレーオフ、入替戦は別の `competition` / `stage` として管理する。同じ年度・同じ部でも、異なるステージの順位や勝点を一つの順位表へ合算しない。Head to Headでは対象ステージを明示したうえで試合単位に集計できる。

ファイルが一定サイズを超えた場合は、試合を月または節、選手をチーム単位へ分割し、`index.json` のmanifestだけを変更する。ブラウザコードへファイル名規則を埋め込まない。

## 3. 共通エンベロープ

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-05-10T06:15:00Z",
  "items": []
}
```

- `schemaVersion`: 破壊的なJSON構造変更時に増やす整数。
- `updatedAt`: 内容が最後に更新されたUTC時刻。
- `items`: IDで安定ソートしたデータ。

ファイル固有メタデータが必要な場合は `meta` を追加する。未知のschemaVersionは画面側で無理に表示せず、利用可能な案内を出す。

## 4. index.json

```json
{
  "schemaVersion": 1,
  "datasetVersion": "2026-05-10T06:15:00Z",
  "timezone": "Asia/Tokyo",
  "files": {
    "competitions": "./competitions.json",
    "teams": "./teams.json",
    "sources": "./sources.json",
    "search": "./search/index.json"
  },
  "seasons": [
    {
      "id": "competition-2026-division-1",
      "season": "./seasons/competition-2026-division-1.json",
      "matches": "./matches/competition-2026-division-1.json",
      "standings": "./standings/competition-2026-division-1.json",
      "players": "./players/competition-2026-division-1.json",
      "stats": "./stats/competition-2026-division-1.json"
    }
  ]
}
```

パスは `index.json` 自身を基準に `new URL(path, indexUrl)` で解決する。

## 5. エンティティ

### competition

```json
{
  "id": "chugoku-university-league",
  "name": "大会名",
  "shortName": "大会略称",
  "slug": "competition-slug",
  "organizer": "主催者名",
  "region": "中国",
  "active": true,
  "sourceIds": ["official-competition-site"]
}
```

### season

```json
{
  "id": "competition-2026-division-1",
  "competitionId": "chugoku-university-league",
  "name": "2026 1部",
  "startDate": "2026-04-01",
  "endDate": "2026-11-30",
  "status": "active",
  "rules": {
    "points": { "win": 3, "draw": 1, "loss": 0 },
    "tieBreakers": ["points", "goalDifference", "goalsFor"]
  },
  "teamIds": ["university-a"]
}
```

### team

```json
{
  "id": "university-a",
  "name": "大学A",
  "shortName": "大学A",
  "slug": "university-a",
  "universityName": "大学A",
  "prefecture": "広島県",
  "aliases": [],
  "logo": null,
  "sourceIds": ["official-competition-site"]
}
```

### player registration（Phase 4実装）

```json
{
  "id": "team-stable-player-id",
  "teamId": "ipu",
  "name": "選手名",
  "englishName": "PLAYER Romanized Name",
  "number": 10,
  "position": "MF",
  "grade": 3,
  "height": 175,
  "weight": 68,
  "birth": "2005-06-01",
  "hometown": null,
  "previousTeam": "出身チーム"
}
```

人物情報はシーズン登録として公開する。`grade`は掲載値を優先し、掲載がない場合は公開された生年月日と日本の学年区分（4月2日〜翌4月1日）から推定できる。推定値はUIで必ず「推定」と明記し、標準的な1〜4年の範囲外は`null`とする。ほかの公開根拠がなく推定を許可していない属性は`null`または空文字で保持する。選手成績とランキングは`players.json`へ重複保存せず、`matches.json`の公開記録からブラウザ起動中に一度だけ集計する。

### team stats（Phase 5実装）

`seasons/{seasonId}/team-stats.json` は同期時に `matches.json`、`teams.json`、`players.json` から生成する派生データである。`all`、`first`（第1〜9節）、`second`（第10〜18節）の各期間について次を保持する。

- 順位表と各チームの現在順位
- ホーム順位、アウェイ順位、勝率表示用成績、前節比の順位変動
- 通算、ホーム、アウェイの勝敗・勝点・得失点
- 直近5試合のフォーム
- 平均得失点、クリーンシート、無得点、カード、ベンチ、平均先発年齢
- 各節終了時点の順位推移
- チームランキング
- 収録済み試合間のHead to Head

ブラウザはこれらを `matches.json` から再集計せず表示する。選手ランキングだけは選手詳細と共有するため、必要画面で `players.json` を遅延読込した後に起動中一度だけ計算する。

### match

```json
{
  "id": "2026-05-10-university-a-university-b",
  "seasonId": "competition-2026-division-1",
  "round": { "id": "round-5", "name": "第5節", "order": 5 },
  "kickoffAt": "2026-05-10T04:00:00Z",
  "timeTbd": false,
  "status": "finished",
  "venue": { "id": "venue-a", "name": "会場A" },
  "teams": [
    { "side": "home", "teamId": "university-a", "score": 2 },
    { "side": "away", "teamId": "university-b", "score": 1 }
  ],
  "events": [
    {
      "id": "event-stable-id",
      "type": "goal",
      "teamId": "university-a",
      "personId": "person-stable-id",
      "period": "secondHalf",
      "minute": 57,
      "addedMinute": 0,
      "sequence": 1
    }
  ],
  "officialStatus": "confirmed",
  "sourceIds": ["official-match-report"]
}
```

試合状態は `scheduled`、`timeTbd`、`postponed`、`cancelled`、`suspended`、`finished`、`awarded`、`abandoned` を基本とする。Actionsの同期間隔では秒単位の信頼できる速報を保証できないため、初期版に `live` は設けない。

### standing row

```json
{
  "seasonId": "competition-2026-division-1",
  "calculatedAt": "2026-05-10T06:15:00Z",
  "confirmed": false,
  "rows": [
    {
      "teamId": "university-a",
      "rank": 1,
      "played": 5,
      "won": 4,
      "drawn": 1,
      "lost": 0,
      "goalsFor": 10,
      "goalsAgainst": 3,
      "goalDifference": 7,
      "points": 13,
      "adjustment": 0
    }
  ]
}
```

### source

```json
{
  "id": "official-match-report",
  "name": "大会公開記録",
  "owner": "大会主催者",
  "url": "https://example.invalid/",
  "termsUrl": null,
  "licenseStatus": "approved",
  "lastCheckedAt": "2026-05-10T06:10:00Z"
}
```

## 6. IDと値の規則

- IDは小文字英数字とハイフンを基本とし、名称変更後も維持する。
- 日時はUTCのISO 8601、日付だけの場合は `YYYY-MM-DD` とする。
- 時刻未定を00:00で代用せず、`kickoffAt: null` と `timeTbd: true` で表す。
- 不明な数値を0で代用せず `null` または項目省略の規則をschemaで定める。
- enumは英語camelCaseまたは小文字文字列で固定する。
- 表示名は日本語を正本とし、別名は配列で保持する。
- JSONへコメント、HTML断片、秘密情報を保存しない。

## 7. 検証規則

### 構造

- JSON構文、UTF-8、schemaVersion、必須キー、型、enumを検査する。
- IDの一意性と安定ソートを検査する。
- indexに列挙した全ファイルが存在し、逆に孤立ファイルがないことを検査する。

### 参照

- seasonのcompetitionId、teamIdsが存在する。
- matchのseasonId、teamId、personId、sourceIdが存在する。
- 1試合に異なる2チームがあり、sideが重複しない。
- standingのteamIdが対象season参加チームに含まれる。

### 競技整合性

- finishedの通常試合には両チームの非負スコアがある。
- 得点イベント集計とスコアが一致するか、明示した例外理由がある。
- 順位の試合数、勝敗、得失点、勝点を公開済み試合から再現できる。
- 同一選手が同じ試合の両チームに属さない。
- イベント順はperiod、minute、addedMinute、sequenceで安定する。

### 同期安全性

- レコード件数の急増・急減、既存ID大量削除をしきい値で止める。
- 情報源の取得失敗時に空配列で正常データを上書きしない。
- 生成前後の差分件数をActions summaryへ出す。

## 8. 派生データ

順位、個人成績、検索索引は元の試合・登録JSONから再生成可能にする。生成物をGit管理する場合も手編集は禁止し、元データ訂正後に再生成する。各生成物の `updatedAt` は入力データに基づき、実行するだけで無意味に変化させない。

## 9. 保持・削除

- `site/data/` は全世界へ公開される前提で項目を選ぶ。
- 原HTMLや一時ファイルは `data/raw/` に置き、GitとPagesの対象外にする。
- テストには合成または匿名化fixtureだけをコミットする。
- 削除対象者は選手JSON、試合イベント、統計、検索索引から連動して非公開化する。
- Git履歴に残る情報への対応は、公開リポジトリ方針と法的要件を確認して手順化する。
