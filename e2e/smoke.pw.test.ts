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

  test("unauthenticated user sees sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toContainText("Sign in");
  });

  test("upload page requires authentication", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.locator("text=Sign in with GitHub to publish roles and skills.")).toBeVisible();
  });

  test("homepage renders hero content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("StrawHub");
    await expect(page.locator("text=The role and skill registry for")).toBeVisible();
    await expect(page.locator("h2", { hasText: "Roles" })).toBeVisible();
    await expect(page.locator("h2", { hasText: "Skills" })).toBeVisible();
    await expect(page.locator("text=strawhub install implementer")).toBeVisible();
  });

  test("search page loads with input", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("h1")).toContainText("Search");
    await expect(page.locator('input[placeholder="Search skills and roles..."]')).toBeVisible();
    await expect(page.locator("text=Type at least 2 characters to search.")).toBeVisible();
  });

  test("navigation to roles works", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Roles"');
    await expect(page).toHaveURL(/\/roles/);
  });

  test("navigation to search works", async ({ page }) => {
    await page.goto("/");
    await page.click('nav >> text="Search"');
    await expect(page).toHaveURL(/\/search/);
  });

  test("dashboard requires authentication", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("text=Sign in with GitHub to manage your published roles and skills.")).toBeVisible();
  });

  test("settings requires authentication", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("text=Sign in with GitHub to manage your account settings.")).toBeVisible();
  });

  test("stars page requires authentication", async ({ page }) => {
    await page.goto("/stars");
    await expect(page.locator("text=Sign in with GitHub to see skills and roles you've starred.")).toBeVisible();
  });

  test("users page requires authentication", async ({ page }) => {
    await page.goto("/users");
    await expect(page.locator("text=Sign in to access this page.")).toBeVisible();
  });
});
