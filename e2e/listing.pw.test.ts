import { test, expect } from "@playwright/test";

test.describe("Skills listing page", () => {
  test("renders heading and description", async ({ page }) => {
    await page.goto("/skills");
    await expect(page.locator("h1")).toContainText("Skills");
    await expect(
      page.locator(
        "text=Markdown instruction modules that agents load into context.",
      ),
    ).toBeVisible();
  });

  test("has filter input and publish button", async ({ page }) => {
    await page.goto("/skills");
    await expect(
      page.locator('input[placeholder="Filter by name, slug, or summary..."]'),
    ).toBeVisible();
    await expect(
      page.locator('a:has-text("Publish Skill")'),
    ).toBeVisible();
  });

  test("publish button links to upload page", async ({ page }) => {
    await page.goto("/skills");
    const publishLink = page.locator('a:has-text("Publish Skill")');
    await expect(publishLink).toHaveAttribute("href", /\/upload/);
  });
});

test.describe("Roles listing page", () => {
  test("renders heading and description", async ({ page }) => {
    await page.goto("/roles");
    await expect(page.locator("h1")).toContainText("Roles");
    await expect(
      page.locator(
        "text=Agent behavior definitions with dependent skills that are resolved recursively on install.",
      ),
    ).toBeVisible();
  });

  test("has filter input and publish button", async ({ page }) => {
    await page.goto("/roles");
    await expect(
      page.locator('input[placeholder="Filter by name, slug, or summary..."]'),
    ).toBeVisible();
    await expect(
      page.locator('a:has-text("Publish Role")'),
    ).toBeVisible();
  });
});

test.describe("Agents listing page", () => {
  test("renders heading and description", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.locator("h1")).toContainText("Agents");
    await expect(
      page.getByText(
        /CLI wrapper binaries that translate StrawPot/,
      ),
    ).toBeVisible();
  });

  test("has filter input and publish button", async ({ page }) => {
    await page.goto("/agents");
    await expect(
      page.locator('input[placeholder="Filter by name, slug, or summary..."]'),
    ).toBeVisible();
    await expect(
      page.locator('a:has-text("Publish Agent")'),
    ).toBeVisible();
  });
});
