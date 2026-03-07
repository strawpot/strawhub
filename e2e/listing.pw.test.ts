import { test, expect } from "@playwright/test";

const ENTITIES = [
  {
    kind: "Skills",
    path: "/skills",
    description:
      "Capabilities that roles depend on. When you install a role, its skills are included automatically.",
    publishLabel: "Publish Skill",
  },
  {
    kind: "Roles",
    path: "/roles",
    description:
      "Job-ready AI workers for StrawPot. Each role defines a complete job profile — skills, tools, and model config. Install once, get everything.",
    publishLabel: "Publish Role",
  },
  {
    kind: "Agents",
    path: "/agents",
    description: /CLI runtimes that execute roles/,
    publishLabel: "Publish Agent",
  },
  {
    kind: "Memories",
    path: "/memories",
    description: /Persistent memory banks/,
    publishLabel: "Publish Memory",
  },
];

for (const entity of ENTITIES) {
  test.describe(`${entity.kind} listing page`, () => {
    test("renders heading and description", async ({ page }) => {
      await page.goto(entity.path);
      await expect(page.locator("h1")).toContainText(entity.kind);
      if (typeof entity.description === "string") {
        await expect(page.locator(`text=${entity.description}`)).toBeVisible();
      } else {
        await expect(page.getByText(entity.description)).toBeVisible();
      }
    });

    test("has filter input and publish button", async ({ page }) => {
      await page.goto(entity.path);
      await expect(
        page.locator(
          'input[placeholder="Filter by name, slug, or summary..."]',
        ),
      ).toBeVisible();
      await expect(
        page.locator(`a:has-text("${entity.publishLabel}")`),
      ).toBeVisible();
    });

    test("publish button links to upload page", async ({ page }) => {
      await page.goto(entity.path);
      const publishLink = page.locator(
        `a:has-text("${entity.publishLabel}")`,
      );
      await expect(publishLink).toHaveAttribute("href", /\/upload/);
    });
  });
}
