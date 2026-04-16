import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

function heroCanvas(page: Page) {
  return page.getByRole("main").locator("canvas").first();
}

test("renders the workspace shell", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Precision answers across every source, page, and moment." })
  ).toBeVisible();
  await expect(page.getByText("Powered by FastAPI, Chroma-ready retrieval, and grounded AI workflows")).toBeVisible();
});

async function sampleCanvas(page: Page) {
  const buffer = await heroCanvas(page).screenshot();
  const png = PNG.sync.read(buffer);

  const { width, height, data } = png;
  const columns = 12;
  const rows = 12;
  const samples: number[] = [];
  let lumaSum = 0;
  const lumas: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, Math.floor(((column + 0.5) / columns) * width));
      const y = Math.min(height - 1, Math.floor(((row + 0.5) / rows) * height));
      const index = (width * y + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;

      samples.push(red, green, blue, alpha);
      lumaSum += luma;
      lumas.push(luma);
    }
  }

  const pixelCount = columns * rows;
  const averageLuma = lumaSum / pixelCount;

  let variance = 0;
  for (const luma of lumas) {
    variance += Math.pow(luma - averageLuma, 2);
  }

  return {
    averageLuma,
    variance: variance / pixelCount,
    samples,
  };
}

function compareSamples(before: number[], after: number[]) {
  let totalDelta = 0;
  const limit = Math.min(before.length, after.length);
  for (let index = 0; index < limit; index += 1) {
    totalDelta += Math.abs(before[index] - after[index]);
  }
  return totalDelta / Math.max(limit, 1);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1024, minVariance: 20 },
  { name: "mobile", width: 430, height: 932, minVariance: 15 },
]) {
  test(`fluid canvas stays visible and reactive on ${viewport.name}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await heroCanvas(page).waitFor({ state: "visible" });
    await page.waitForTimeout(800);

    const first = await sampleCanvas(page);
    expect(first.averageLuma).toBeGreaterThan(8);
    expect(first.variance).toBeGreaterThan(viewport.minVariance);

    await page.mouse.move(viewport.width * 0.2, viewport.height * 0.2);
    await page.waitForTimeout(450);
    const second = await sampleCanvas(page);

    await page.mouse.move(viewport.width * 0.78, viewport.height * 0.76);
    await page.waitForTimeout(450);
    const third = await sampleCanvas(page);

    expect(compareSamples(first.samples, second.samples)).toBeGreaterThan(0.12);
    expect(compareSamples(second.samples, third.samples)).toBeGreaterThan(0.12);

    await page.screenshot({ path: test.info().outputPath(`workspace-${viewport.name}.png`), fullPage: true });
  });
}
