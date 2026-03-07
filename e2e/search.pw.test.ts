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

});
