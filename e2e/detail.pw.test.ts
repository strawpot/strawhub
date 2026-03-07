import { test, expect } from "@playwright/test";

const ENTITIES = [
  { kind: "Skills", path: "/skills", backText: "Back to Skills", notFoundText: "Skill not found" },
  { kind: "Roles", path: "/roles", backText: "Back to Roles", notFoundText: "Role not found" },
  { kind: "Agents", path: "/agents", backText: "Back to Agents", notFoundText: "Agent not found" },
  { kind: "Memories", path: "/memories", backText: "Back to Memories", notFoundText: "Memory not found" },
];

for (const entity of ENTITIES) {
  test.describe(`${entity.kind} detail page`, () => {
    test("shows not-found for nonexistent slug", async ({ page }) => {
      await page.goto(`${entity.path}/nonexistent-slug-12345`);
      await expect(
        page.locator(`text=${entity.notFoundText}`),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("has back link to listing page", async ({ page }) => {
      await page.goto(`${entity.path}/nonexistent-slug-12345`);
      await expect(
        page.locator(`text=${entity.notFoundText}`),
      ).toBeVisible({ timeout: 10_000 });
      const backLink = page.locator(`a:has-text("${entity.backText}")`);
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute("href", new RegExp(entity.path));
    });
  });
}
