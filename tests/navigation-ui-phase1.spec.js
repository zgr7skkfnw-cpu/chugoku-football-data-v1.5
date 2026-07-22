import { expect, test } from "@playwright/test";

const BASE_URL = "http://localhost:4173/";

async function swipe(locator, fromX, toX, y = 300) {
  await locator.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: fromX, clientY: y });
  await locator.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: toX, clientY: y + 4 });
}

test("試合日をボタンとスワイプで変更しURLと再読み込みへ維持する", async ({ page }) => {
  await page.goto(`${BASE_URL}?date=2026-08-30`);
  await expect(page.locator('[data-page="home"]')).toHaveAttribute("data-selected-date", "2026-08-30");
  await page.getByRole("button", { name: "翌日" }).click();
  await expect(page).toHaveURL(/date=2026-08-31/);
  await swipe(page.locator('[data-page="home"]'), 320, 80);
  await expect(page).toHaveURL(/date=2026-09-01/);
  await page.reload();
  await expect(page.locator('[data-page="home"]')).toHaveAttribute("data-selected-date", "2026-09-01");
  await expect(page.locator(".match-date-navigation")).toHaveCSS("position", "sticky");
  await expect(page.locator(".season-selector")).toHaveCount(0);
});

test("大会一覧は全展開で開始し見出し全体から折りたためる", async ({ page }) => {
  await page.goto(`${BASE_URL}?date=2026-08-30`);
  await expect(page.locator(".collapsible-competition")).toHaveCount(2);
  await expect(page.locator(".collapsible-competition__body")).toHaveCount(2);
  const first = page.locator(".collapsible-competition").first();
  await expect(first.locator(".match-row")).toHaveCount(5);
  await first.locator(".collapsible-competition__toggle").click();
  await expect(first.locator(".collapsible-competition__body")).toBeHidden();
  await expect(first.locator(".collapsible-competition__count")).toHaveText("5");
});

test("明日はフォロー欄を大会一覧より先に表示しフォローなしでも安全に表示する", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  const tomorrow = await page.evaluate(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(value);
  });
  await page.goto(`${BASE_URL}?date=${tomorrow}`);
  await expect(page.locator(".tomorrow-following")).toContainText("フォロー中のチームの試合はありません。");
  await expect(page.locator(".tomorrow-following")).toHaveCount(1);
});

test("フォロー中はチームカードと安定IDの選手フォローを保存する", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE_URL}?view=team&id=ipu`);
  await page.locator(".favorite-button").click();
  await page.goto(`${BASE_URL}?view=player&id=ipu-032c11837e6d`);
  await page.locator(".player-follow-button").click();
  await expect(page.locator(".player-follow-button")).toHaveAttribute("aria-pressed", "true");
  await page.goto(`${BASE_URL}?view=following`);
  await expect(page.locator(".following-team-card")).toContainText("IPU・環太平洋大学");
  await page.getByRole("tab", { name: "選手" }).click();
  await expect(page.locator(".following-player-card")).toContainText("細川 柊飛");
  await page.reload();
  await page.getByRole("tab", { name: "選手" }).click();
  await expect(page.locator(".following-player-card")).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chugoku-football.favorite-players")))).toEqual(["ipu-032c11837e6d"]);
});

test("複数チームを保存・解除し次戦順と次戦なしを安定表示する", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  for (const teamId of ["fukuyama", "ipu", "i-league-2025-ipu-a"]) {
    await page.goto(`${BASE_URL}?view=team&id=${teamId}`);
    await page.locator(".favorite-button").click();
  }
  await page.goto(`${BASE_URL}?view=following`);
  const cards = page.locator(".following-team-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.last()).toHaveAttribute("data-team-id", "i-league-2025-ipu-a");
  const scheduledTimes = await cards.evaluateAll((items) => items.slice(0, 2).map((item) => Date.parse(item.dataset.nextKickoff)));
  expect(scheduledTimes[0]).toBeLessThanOrEqual(scheduledTimes[1]);

  await page.goto(`${BASE_URL}?view=team&id=ipu`);
  await page.locator(".favorite-button").click();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chugoku-football.favorite-teams")))).toEqual({ teamIds: ["fukuyama", "i-league-2025-ipu-a"] });
  await page.goto(`${BASE_URL}?view=following`);
  await expect(page.locator(".following-team-card")).toHaveCount(2);
});

test("旧1チーム形式を配列へ移行し他のフォロー・並び順設定を維持する", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("chugoku-football.favorite-team", "ipu");
    localStorage.setItem("chugoku-football.favorite-players", JSON.stringify(["ipu-032c11837e6d"]));
    localStorage.setItem("chugoku-football.league-order", JSON.stringify(["jufa-chugoku-2026-division-2"]));
  });
  await page.reload();
  await page.goto(`${BASE_URL}?view=following`);
  await expect(page.locator(".following-team-card")).toHaveCount(1);
  expect(await page.evaluate(() => ({
    teams: JSON.parse(localStorage.getItem("chugoku-football.favorite-teams")),
    legacy: localStorage.getItem("chugoku-football.favorite-team"),
    players: JSON.parse(localStorage.getItem("chugoku-football.favorite-players")),
    order: JSON.parse(localStorage.getItem("chugoku-football.league-order")),
  }))).toEqual({
    teams: { teamIds: ["ipu"] }, legacy: null,
    players: ["ipu-032c11837e6d"], order: ["jufa-chugoku-2026-division-2"],
  });
});

test("保存済みチームIDの重複を読み込み時に除去する", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("chugoku-football.favorite-teams", JSON.stringify({ teamIds: ["ipu", "ipu"] }));
  });
  await page.reload();
  await page.goto(`${BASE_URL}?view=following`);
  await expect(page.locator(".following-team-card")).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("chugoku-football.favorite-teams")))).toEqual({ teamIds: ["ipu"] });
});

test("明日の複数フォロー試合を時刻順に重複なしで表示する", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-29T12:00:00+09:00"));
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.setItem("chugoku-football.favorite-teams", JSON.stringify({
    teamIds: ["ipu", "yamaguchi", "hiroshima-institute-of-technology", "shimane"],
  })));
  await page.reload();
  await page.goto(`${BASE_URL}?date=2026-08-30`);
  const cards = page.locator(".tomorrow-following__card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("16:00");
  await expect(cards.nth(1)).toContainText("17:00");
  const matchIds = await cards.evaluateAll((items) => items.map((item) => new URL(item.href).searchParams.get("id")));
  expect(new Set(matchIds).size).toBe(2);
});

test("大会カード順を保存して初期順へ戻せる", async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE_URL}?view=standings`);
  const rows = page.locator(".league-card-row");
  await expect(rows.first()).toHaveAttribute("data-competition-id", "jufa-chugoku-2026-division-1");
  await rows.nth(1).getByRole("button", { name: /上へ/ }).click();
  await expect(rows.first()).toHaveAttribute("data-competition-id", "jufa-chugoku-2026-division-2");
  await page.reload();
  await expect(rows.first()).toHaveAttribute("data-competition-id", "jufa-chugoku-2026-division-2");
  await page.getByRole("button", { name: "初期順序へ戻す" }).click();
  await expect(rows.first()).toHaveAttribute("data-competition-id", "jufa-chugoku-2026-division-1");
});

test("リーグ詳細タブはクリックとスワイプに対応し横表スクロールと競合しない", async ({ page }) => {
  await page.goto(`${BASE_URL}?view=league&competition=jufa-chugoku-2026-division-1&season=2026`);
  await expect(page.getByRole("tab", { name: "2部", exact: true })).toHaveCount(0);
  await expect(page.getByText("参加チーム", { exact: true })).toHaveCount(0);
  const content = page.locator(".league-detail-section").first();
  await swipe(content, 320, 70);
  await expect(page.getByRole("tab", { name: "試合", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".match-list--timeline")).toHaveAttribute("data-match-count", "90");
  await expect(page.locator(".match-round-group.is-timeline-focus")).toHaveCount(1);
  await swipe(page.locator(".match-list--timeline"), 320, 70);
  await expect(page.getByRole("tab", { name: "シーズン", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "順位表", exact: true }).click();
  await swipe(page.locator(".table-scroll").first(), 320, 70);
  await expect(page.getByRole("tab", { name: "順位表", exact: true })).toHaveAttribute("aria-selected", "true");

  await content.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100 });
  await content.dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", clientX: 207, clientY: 260 });
  await expect(page.getByRole("tab", { name: "順位表", exact: true })).toHaveAttribute("aria-selected", "true");

  await swipe(page.locator("#bottom-navigation"), 320, 70, 700);
  await expect(page).toHaveURL(/view=league/);
});
