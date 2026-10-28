import { expect, test, type Page } from "@playwright/test";

/**
 * The Bands dialog edits a draft of the Band list (ADR-0002 decision 84, rule
 * 6): the chart changes only on Apply, at the footer's right with Reset bands
 * at its left, and the corner's Close and Escape discard the draft.
 * An Edge typed out of order is refused when it is committed, its box showing
 * the Edge as it was and its cell saying why, with no toast, until a new value
 * is typed in it.
 */

/** PMV (ASHRAE 55)'s thermal sensation: band 4, Neutral, has its upper Edge at 0.5, between -0.5 and 1.5. */
const EXPLORE_ADDRESS = "/explore/pmv-ppd-ashrae";

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(EXPLORE_ADDRESS);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

async function openBands(page: Page) {
  await page.getByRole("button", { name: "Bands", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** The accessible name of band `band`'s upper-Edge box, counted from 1. */
const edgeName = (band: number) => new RegExp(`^Upper edge.*, band ${band}$`);

/** Band `band`'s upper-Edge box in the open dialog. */
const edgeBox = (page: Page, band: number) => page.getByRole("dialog").getByRole("spinbutton", { name: edgeName(band) });

/** The open dialog's footer: Reset bands and Apply, no Close of its own. */
const footer = (page: Page) => page.getByRole("dialog").locator('[data-slot="dialog-footer"]');

/** Every path the chart's plot draws, in order: what moves when a band's Edge does. */
function plotPaths(page: Page): Promise<string[]> {
  return page.locator(".chart-plot svg path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
}

/** The toasts standing: a closed one stays a moment for Sonner's exit animation, marked `data-removed`. */
function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ }).locator('li[data-sonner-toast]:not([data-removed="true"])');
}

test("the footer holds Reset bands at its left and Apply at its right, and no Close", async ({ page }) => {
  await open(page);
  await openBands(page);
  await expect(footer(page).getByRole("button")).toHaveCount(2);
  const reset = await footer(page).getByRole("button", { name: "Reset bands", exact: true }).boundingBox();
  const apply = await footer(page).getByRole("button", { name: "Apply", exact: true }).boundingBox();
  const bar = await footer(page).boundingBox();
  if (!reset || !apply || !bar) {
    throw new Error("the footer and its two buttons are on screen");
  }

  // Each stands at the footer's padding on its own side, the room between them empty.
  expect(Math.abs(reset.x - bar.x - (bar.x + bar.width - apply.x - apply.width))).toBeLessThan(1);
  expect(apply.x - (reset.x + reset.width)).toBeGreaterThan(bar.width / 2);
});

test("moving an Edge in the dialog leaves the chart as it was until Apply, and Close and Escape discard the move", async ({ page }) => {
  await open(page);
  const drawn = await plotPaths(page);

  for (const discard of [() => page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click(), () => page.keyboard.press("Escape")]) {
    await openBands(page);
    await edgeBox(page, 4).fill("0.7");
    await edgeBox(page, 4).press("Enter");
    await expect(edgeBox(page, 4)).toHaveValue("0.7");
    expect(await plotPaths(page)).toEqual(drawn);

    await discard();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(await plotPaths(page)).toEqual(drawn);
    await openBands(page);
    await expect(edgeBox(page, 4)).toHaveValue("0.5");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  await openBands(page);
  await edgeBox(page, 4).fill("0.7");
  await edgeBox(page, 4).press("Enter");
  await footer(page).getByRole("button", { name: "Apply", exact: true }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(() => plotPaths(page)).not.toEqual(drawn);
  await openBands(page);
  await expect(edgeBox(page, 4)).toHaveValue("0.7");
});

test("an Edge typed past its neighbour is refused on leaving its box, and its cell says why until that Edge is typed in again", async ({ page }) => {
  await open(page);
  await openBands(page);
  const box = edgeBox(page, 4);
  const cell = page.getByRole("dialog").getByRole("cell").filter({ has: page.getByRole("spinbutton", { name: edgeName(4) }) });

  await box.fill("2");
  await box.press("Tab");

  await expect(box).toHaveValue("0.5");
  await expect(cell.getByRole("alert")).toHaveText("Not taken: 2 is not between -0.5 and 1.5, the edges beside it.");
  await expect(toasts(page)).toHaveCount(0);

  await box.pressSequentially("7");
  await expect(cell.getByRole("alert")).toHaveCount(0);
});
