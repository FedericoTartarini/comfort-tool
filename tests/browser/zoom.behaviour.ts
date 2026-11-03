import { expect, test, type Page } from "@playwright/test";

/**
 * The plot's viewport follows the person (USYD-145): a box zoom after Reset
 * axes lands on the box, and Pan from the modebar moves the axes. Both broke
 * while the figure gave its traces different `zorder`s (plotly.js #7320).
 * The hover readout still answers over the plot. Ranges are read off the
 * drawn node; nothing is a screenshot.
 */

/** Charts whose spec lays a hover grid under lines and over others: PMV's psychrometric chart and the Adaptive chart. */
const ADDRESSES = ["/standard/ashrae-55-2023/pmv-ppd-ashrae", "/standard/ashrae-55-2023/adaptive-ashrae"];

/** The box every drag draws, as fractions of the plot area from its top left. */
const BOX_FROM = 0.3;
const BOX_TO = 0.7;

interface Ranges {
  x: number[];
  y: number[];
}

/** The axis ranges Plotly drew, off the plot's node. */
function rangesOf(page: Page): Promise<Ranges> {
  return page.locator(".chart-plot").evaluate((node) => {
    const { xaxis, yaxis } = (node as unknown as { _fullLayout: { xaxis: { range: number[] }; yaxis: { range: number[] } } })._fullLayout;
    return { x: [...xaxis.range], y: [...yaxis.range] };
  });
}

/** Drags across the plot area from `BOX_FROM` to `BOX_TO` of its width and height. */
async function dragAcross(page: Page) {
  const area = await page.locator(".chart-plot .nsewdrag").first().boundingBox();
  if (!area) {
    throw new Error("the plot has no drag area");
  }
  await page.mouse.move(area.x + area.width * BOX_FROM, area.y + area.height * BOX_FROM);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * BOX_TO, area.y + area.height * BOX_TO, { steps: 10 });
  await page.mouse.up();
}

async function clickModebar(page: Page, title: string) {
  await page.locator(".chart-plot").hover();
  await page.locator(`.chart-plot .modebar-btn[data-title="${title}"]`).click();
}

/** The x range a box from `BOX_FROM` to `BOX_TO` cuts out of `range`. */
function boxOf(range: number[]): number[] {
  const span = range[1] - range[0];
  return [range[0] + BOX_FROM * span, range[0] + BOX_TO * span];
}

async function open(page: Page, address: string) {
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

for (const address of ADDRESSES) {
  test(`${address}: a box zoom after Reset axes lands on the box`, async ({ page }) => {
    await open(page, address);
    const start = await rangesOf(page);
    await dragAcross(page);
    await expect.poll(async () => (await rangesOf(page)).x).not.toEqual(start.x);
    await clickModebar(page, "Reset axes");
    await expect.poll(async () => (await rangesOf(page)).x).toEqual(start.x);

    await dragAcross(page);
    const [from, to] = boxOf(start.x);
    await expect.poll(async () => (await rangesOf(page)).x[0]).toBeCloseTo(from, 0);
    expect((await rangesOf(page)).x[1]).toBeCloseTo(to, 0);
  });

  test(`${address}: Pan from the modebar moves the axes`, async ({ page }) => {
    await open(page, address);
    const start = await rangesOf(page);
    await clickModebar(page, "Pan");
    await dragAcross(page);
    // Dragged right and down, the view moves left and up.
    await expect.poll(async () => (await rangesOf(page)).x[0]).toBeLessThan(start.x[0]);
    expect((await rangesOf(page)).y[0]).toBeGreaterThan(start.y[0]);
  });

  test(`${address}: the hover readout answers over the plot`, async ({ page }) => {
    await open(page, address);
    const area = await page.locator(".chart-plot .nsewdrag").first().boundingBox();
    if (!area) {
      throw new Error("the plot has no drag area");
    }
    await page.mouse.move(area.x + area.width * 0.5, area.y + area.height * 0.5);
    await expect(page.locator(".chart-plot .hoverlayer .hovertext").first()).toBeVisible();
  });
}

// Plotly saves the ranges Reset axes returns to only when it draws on an empty
// node, and the chart keeps one node while its axes change.
test("Reset axes after a chart type change returns to the new chart's ranges", async ({ page }) => {
  await open(page, ADDRESSES[0]);
  const first = await rangesOf(page);
  await page.getByRole("button", { name: "Chart type", exact: true }).click();
  await page.getByRole("option", { name: "Dynamic", exact: true }).click();
  await expect.poll(async () => await rangesOf(page)).not.toEqual(first);
  const drawn = await rangesOf(page);
  await clickModebar(page, "Reset axes");
  // A right Reset leaves the ranges where they are, so there is no change to poll for; the wait lets its redraw land.
  await page.waitForTimeout(300);
  expect(await rangesOf(page)).toEqual(drawn);
});
