import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("homepage loads with navigation", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav).toContainText("StrawHub");
    await expect(nav).toContainText("Skills");
    await expect(nav).toContainText("Roles");
    await expect(nav).toContainText("Search");
    await expect(nav).toContainText("Publish");
  });

  test("skills page loads", async ({ page }) => {
    await page.goto("/skills");
    await expect(page).toHaveURL(/\/skills/);
  });

  test("roles page loads", async ({ page }) => {
    await page.goto("/roles");
    await expect(page).toHaveURL(/\/roles/);
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Skills"');
    await expect(page).toHaveURL(/\/skills/);
  });

  test("unauthenticated user sees sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toContainText("Sign in");
  });
});
