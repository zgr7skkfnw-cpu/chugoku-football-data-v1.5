import { test, expect } from "@playwright/test";
import upper from "../site/data/seasons/2025/i-league/playoff/upper/matches.json" with { type: "json" };
import lower from "../site/data/seasons/2025/i-league/playoff/lower/matches.json" with { type: "json" };

const BASE = "http://127.0.0.1:4173/";
const D2_2025 = "jufa-chugoku-2025-division-2";
const D2_PLAYOFF_2025 = "jufa-chugoku-2025-division-2-playoff";
const D2_PLAYOFF_2026 = "jufa-chugoku-2026-division-1-promotion-playoff";
const I_UPPER_2025 = "jufa-chugoku-2025-i-league-upper-playoff";
const I_LOWER_2025 = "jufa-chugoku-2025-i-league-lower-playoff";
const I_PLAYOFF_2026 = "jufa-chugoku-2026-i-league-playoff";
const RELEGATION_2025 = "jufa-chugoku-2025-promotion-relegation";
const RELEGATION_2026 = "jufa-chugoku-2026-promotion-relegation";

test("大会一覧は内部プレーオフを重複表示せずIリーグを一つにまとめる", async ({ page }) => {
  await page.goto(`${BASE}?view=standings`);
  await expect(page.getByRole("link", { name: "Iリーグ中国の詳細を表示" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /昇格プレーオフの詳細/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /順位決定プレーオフの詳細/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "1部・2部入替戦の詳細を表示" })).toBeVisible();
});

test("2部ページ内で2025年リーグ戦とプレーオフ3試合を分離する", async ({ page }) => {
  await page.goto(`${BASE}?view=league&competition=${D2_2025}&season=2025`);
  await expect(page.getByRole("tab", { name: "2部" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "昇格プレーオフ" })).toBeVisible();
  await page.getByRole("tab", { name: "昇格プレーオフ" }).click();
  await expect(page).toHaveURL(new RegExp(`competition=${D2_PLAYOFF_2025}`));
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "3");
  await page.reload();
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "3");
});

test("2026年の2部・Iリーグ内部プレーオフは架空データなしで未公開表示する", async ({ page }) => {
  for (const [id, message] of [
    [D2_PLAYOFF_2026, "2026年の昇格プレーオフ情報はまだ公式発表されていません。"],
    [I_PLAYOFF_2026, "2026年のIリーグ順位決定プレーオフ情報はまだ公式発表されていません。"],
  ]) {
    await page.goto(`${BASE}?view=league&competition=${id}&season=2026`);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.locator(".match-card")).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`competition=${id}`));
  }
});

test("2025年Iリーグ上位6試合・下位9試合と入替戦2試合を大会別表示する", async ({ page }) => {
  expect(upper.items).toHaveLength(6);
  expect(lower.items).toHaveLength(9);
  await page.goto(`${BASE}?view=league&competition=${I_UPPER_2025}&season=2025`);
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "6");
  await page.getByRole("tab", { name: "下位プレーオフ" }).click();
  await expect(page).toHaveURL(new RegExp(`competition=${I_LOWER_2025}`));
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "9");
  await page.goto(`${BASE}?view=league&competition=${RELEGATION_2025}&season=2025`);
  await expect(page.locator(".match-list")).toHaveAttribute("data-match-count", "2");
  await page.goto(`${BASE}?view=league&competition=${RELEGATION_2026}&season=2026`);
  await expect(page.getByText("2026年度は大会要項上、1部・2部入替戦を実施しません。", { exact: false })).toBeVisible();
});

test("管理画面は親大会別optgroupと未公開大会の補正先を保持する", async ({ page }) => {
  await page.goto(`${BASE}?view=admin`);
  const select = page.getByLabel("補正する大会");
  await expect(select.locator("option")).toHaveCount(9);
  for (const label of ["中国大学サッカーリーグ2部", "Iリーグ", "カップ戦", "昇降格"]) {
    await expect(select.locator(`optgroup[label="${label}"]`)).toHaveCount(1);
  }
  for (const id of [D2_PLAYOFF_2026, I_PLAYOFF_2026]) {
    await select.selectOption(id);
    await expect(page.locator(".admin-competition-status")).toHaveText("この大会の公式試合データはまだ公開されていません。");
    await expect(page.getByLabel("補正する試合")).toBeDisabled();
  }
  await select.selectOption(RELEGATION_2026);
  await expect(page.locator(".admin-competition-status")).toHaveText("2026年度は大会要項上、1部・2部入替戦を実施しません。");
  await expect(page.getByLabel("補正する試合")).toBeDisabled();
});
