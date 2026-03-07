import { test, expect } from "@playwright/test";

test.describe("Search page", () => {
  test("shows prompt when query is too short", async ({ page }) => {
    await page.goto("/search");
    const input = page.locator(
      'input[placeholder="Search roles, skills, agents, and memories..."]',
    );
    await input.fill("a");
    await expect(
      page.locator("text=Type at least 2 characters to search."),
    ).toBeVisible();
  });

  test("has kind filter dropdown with all options", async ({ page }) => {
    await page.goto("/search");
    const select = page.locator("select");
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveText([
      "All",
      "Roles",
      "Skills",
      "Agents",
      "Memories",
    ]);
  });

  test("kind filter can be changed", async ({ page }) => {
    await page.goto("/search");
    const select = page.locator("select");
    await select.selectOption("skill");
    await expect(select).toHaveValue("skill");
    await select.selectOption("role");
    await expect(select).toHaveValue("role");
    await select.selectOption("agent");
    await expect(select).toHaveValue("agent");
    await select.selectOption("all");
    await expect(select).toHaveValue("all");
  });

});
