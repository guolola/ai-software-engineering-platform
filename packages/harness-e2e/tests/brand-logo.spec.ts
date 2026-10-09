// Verifies actual SVG colors across app surfaces and official MCP client marks in the browser.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockProjectApi } from './fixtures/project-workspace';

async function mockBrandPage(page: Page) {
  await mockProjectApi(page);
  await page.route('**/api/mcp/connections', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ enabled: true, serverUrl: 'https://platform.example/api/mcp', csrf: 'test-csrf', projects: [], connections: [] }),
  }));
}
async function colors(logo: Locator) {
  return logo.evaluate((svg) => {
    const context = document.createElement('canvas').getContext('2d')!;
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const badge = svg.querySelector('rect');
    return {
      badge: badge ? rgb(getComputedStyle(badge).fill) : null,
      glyph: rgb(getComputedStyle(svg.querySelector('path')!).fill),
    };
  });
}

for (const path of ['/', '/tutorial', '/projects/connections']) {
  test(`brand colors follow the theme on ${path}`, async ({ page }) => {
    await mockBrandPage(page);
    await page.route('**/*.mp4', (route) => route.abort());
    await page.addInitScript(() => {
      if (!localStorage.getItem('admincn-ui-theme')) localStorage.setItem('admincn-ui-theme', 'light');
      localStorage.setItem('uml-lab-locale-preference', 'zh-CN');
    });
    await page.goto(path);
    const logo = page.locator('svg[data-slot="product-logo"]').first();
    await expect(logo).toBeVisible();
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [24, 24, 27] });
    if (path === '/') {
      await expect.poll(() => colors(page.getByTestId('hero-orbit').locator('[data-slot="product-logo"]')))
        .toEqual({ badge: [24, 24, 27], glyph: [250, 250, 250] });
    }
    await page.getByRole('button', { name: /切换明暗主题|切换到深色/ }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [244, 244, 245] });
    if (path === '/') {
      await expect.poll(() => colors(page.getByTestId('hero-orbit').locator('[data-slot="product-logo"]')))
        .toEqual({ badge: [244, 244, 245], glyph: [24, 24, 27] });
    }
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [244, 244, 245] });
    if (path === '/') {
      await expect.poll(() => colors(page.getByTestId('hero-orbit').locator('[data-slot="product-logo"]')))
        .toEqual({ badge: [244, 244, 245], glyph: [24, 24, 27] });
    }
    await page.getByRole('button', { name: /切换明暗主题|切换到浅色/ }).click();
    await expect.poll(() => colors(logo)).toEqual({ badge: null, glyph: [24, 24, 27] });
    if (path === '/') {
      await expect.poll(() => colors(page.getByTestId('hero-orbit').locator('[data-slot="product-logo"]')))
        .toEqual({ badge: [24, 24, 27], glyph: [250, 250, 250] });
    }
  });
}

test('MCP catalog uses official client artwork and accurate navigation labels', async ({ page }) => {
  await mockBrandPage(page);
  await page.addInitScript(() => localStorage.setItem('uml-lab-locale-preference', 'zh-CN'));
  await page.goto('/projects/connections');
  await expect(page.getByRole('link', { name: 'MCP 连接', exact: true })).toBeVisible();
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'VS Code', exact: true }) })).toBeVisible();
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'VS Code MCP Agent', exact: true }) })).toHaveCount(0);
  const brand = page.getByRole('link', { name: '软件工程实践平台', exact: true });
  const brandLogo = brand.locator('[data-slot="product-logo"]');
  await expect.poll(async () => (await brandLogo.boundingBox())?.width).toBe(32);
  const expandedLogoBounds = (await brandLogo.boundingBox())!;
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect.poll(async () => (await brandLogo.boundingBox())?.width).toBe(32);
  // Wait for the sidebar width transition before checking that the brand is fully contained.
  await expect.poll(async () => {
    const logoBounds = (await brandLogo.boundingBox())!;
    const buttonBounds = (await brand.boundingBox())!;
    return logoBounds.x >= buttonBounds.x && logoBounds.y >= buttonBounds.y
      && logoBounds.x + logoBounds.width <= buttonBounds.x + buttonBounds.width
      && logoBounds.y + logoBounds.height <= buttonBounds.y + buttonBounds.height;
  }).toBe(true);
  const collapsedLogoBounds = (await brandLogo.boundingBox())!;
  expect(collapsedLogoBounds.x).toBeCloseTo(expandedLogoBounds.x, 0);
  expect(collapsedLogoBounds.y).toBeCloseTo(expandedLogoBounds.y, 0);
  await expect(brand).toHaveAccessibleName('软件工程实践平台');
  for (const [name, src] of [['WorkBuddy', '/mcp/clients/workbuddy.svg'], ['VS Code', '/mcp/clients/vscode.svg']]) {
    const image = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) }).locator('img');
    await expect(image).toHaveAttribute('src', src);
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
});
