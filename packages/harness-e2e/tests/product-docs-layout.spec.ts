// Verifies document-flow scrolling, responsive navigation and article anchors in the real shell.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockProjectApi } from "./fixtures/project-workspace";

async function wheelTo(page: Page, target: Locator) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(page.viewportSize()!.width - 24, 250);
  await page.mouse.wheel(0, box!.y - 160);
  await expect(target).toBeInViewport();
}

for (const width of [1920, 1440, 1024, 390]) {
  for (const locale of ["zh-CN", "en"]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test.describe(`${width} ${locale} ${colorScheme}`, () => {
        test.use({ viewport: { width, height: 900 }, locale, colorScheme });
        test("tutorial keeps the platform shell while its document region scrolls", async ({ page }, info) => {
          await mockProjectApi(page);
          await page.route("**/*.mp4", (route) => route.abort());
          await page.addInitScript(({ locale }) => {
            localStorage.setItem("uml-lab-locale-preference", locale);
          }, { locale });
          await page.goto("/tutorial");
          const article = page.getByRole("article");
          const title = article.getByRole("heading", { level: 1 });
          await expect(title).toBeVisible();
          await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));
          const reading = page.getByTestId("product-docs-page");
          const header = page.locator('[data-slot="sidebar-inset"] > header');
          await expect(header).toBeVisible();
          await expect(header.getByRole("button", { name: "Toggle Sidebar" })).toBeVisible();
          const headerY = (await header.boundingBox())!.y;
          if (width < 768) await header.getByRole("button", { name: "Toggle Sidebar" }).click();
          const platformLink = page.locator('[data-slot="sidebar-menu-button"][href="/tutorial"]');
          await expect(platformLink).toBeVisible();
          await expect(platformLink).toHaveAttribute("aria-current", "page");
          if (width < 768) await page.keyboard.press("Escape");
          const readingWidth = (await reading.boundingBox())!.width;
          const compact = readingWidth < 720;
          const hasOutline = readingWidth >= 1200;
          expect(await page.locator("h1").count()).toBe(1);
          expect(await article.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(800);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

          const directory = page.locator("#product-docs-directory");
          if (compact) {
            await expect(directory).toBeHidden();
            // The accessible control owns the directory even when localized wording changes.
            await page.locator('[aria-controls="product-docs-directory"]').click();
          }
          await expect(directory).toBeVisible();
          const finalEntry = directory.locator('[data-slot="sidebar-menu-button"]').last();
          await wheelTo(page, finalEntry);
          expect(await reading.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
          expect(await page.evaluate(() => scrollY)).toBe(0);
          expect(await directory.evaluate((node) => node.scrollTop)).toBe(0);

          await wheelTo(page, title);
          if (compact) {
            await page.locator('[aria-controls="product-docs-directory"]').click();
            await expect(directory).toBeHidden();
          }
          await wheelTo(page, article.locator("h2").last());
          await wheelTo(page, page.getByTestId("docs-footer"));
          await expect(header).toBeInViewport();
          await expect.poll(async () => (await header.boundingBox())!.y).toBe(headerY);

          // Wheel back to the top, then change articles through the same menu used on mobile.
          await page.mouse.move(width - 24, 300);
          await page.mouse.wheel(0, -100000);
          await expect.poll(() => reading.evaluate((node) => node.scrollTop)).toBe(0);
          if (compact) await page.locator('[aria-controls="product-docs-directory"]').click();
          const secondEntry = directory.locator('[data-slot="sidebar-menu-button"]').nth(1);
          const selectedName = await secondEntry.innerText();
          await secondEntry.click();
          await expect(title).toHaveText(selectedName);
          await expect(title).toBeFocused();
          await expect(title).toBeInViewport();
          if (compact) {
            await expect(directory).toBeHidden();
            await expect(page.locator('[aria-controls="product-docs-directory"]')).toHaveAttribute("aria-expanded", "false");
          }
          expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual((await reading.boundingBox())!.y + (compact ? 64 : 16));
          const outline = reading.locator('aside').last();
          if (hasOutline) {
            await outline.locator("a").last().click();
            const hash = await page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
            const target = page.locator(`[id="${hash}"]`);
            await expect(target).toBeInViewport();
            // Wait for the smooth anchor scroll to finish before sending the next wheel gesture.
            const expectedScroll = await target.evaluate((node) => {
              const region = node.closest('[data-testid="product-docs-page"]')!;
              const offset = node.getBoundingClientRect().top - region.getBoundingClientRect().top;
              const desired = region.scrollTop + offset - parseFloat(getComputedStyle(node).scrollMarginTop);
              return Math.max(0, Math.min(desired, region.scrollHeight - region.clientHeight));
            });
            await expect.poll(() => reading.evaluate((node) => node.scrollTop)).toBeCloseTo(expectedScroll, 0);
            expect((await target.boundingBox())!.y).toBeGreaterThanOrEqual((await reading.boundingBox())!.y);
          } else {
            await expect(outline).toBeHidden();
          }
          await page.mouse.move(width - 24, 300);
          await page.mouse.wheel(0, -100000);
          await expect.poll(() => reading.evaluate((node) => node.scrollTop)).toBe(0);
          await expect(page.getByTestId("platform-loading-screen")).toHaveCount(0);
          await page.screenshot({ path: info.outputPath("tutorial.png") });
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        });
      });
    }
  }
}
