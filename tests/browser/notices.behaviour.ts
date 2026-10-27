import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Every notice the app gives is a toast at the top right, under the header
 * and level with the cards, kept until its close button closes it, and the
 * header holds none (ADR-0002 decision 84, rule 7). Each notice is raised
 * where the page raises it: a link at the first address, Share's clipboard,
 * the Image's download. A notice raised again replaces its own toast, and
 * Reset takes the toasts standing with it.
 */

const PMV_ADDRESS = "/standard/ashrae-55/pmv-ppd-ashrae";
const ISO_ADDRESS = "/standard/iso-7730/pmv-ppd-iso";

/** PMV (ISO 7730) at its defaults as Share writes it, with slot 1's metabolic rate taken out: read, but not exactly. */
const FILLED_LINK = `v1.${Buffer.from(
  JSON.stringify({
    model: "pmv_ppd_iso",
    unitSystem: "si",
    p_atm: 101325,
    compare: false,
    enabled: [false, false],
    entryModes: { temperature: "separate", airSpeed: "air-speed", clothing: "clothing-insulation", humidity: "relative-humidity" },
    slots: [{ values: { tdb: 25, tr: 25, v: 0.1, clo: 0.5, rh: 50 }, options: {} }, null, null],
    charts: { pmv_ppd_iso: { type: "psychrometric", axes: { x: "tdb", y: "v" } } },
  }),
).toString("base64url")}`;

const WIDTH = 1440;

async function open(page: Page, address: string) {
  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}

/** The toasts standing: a closed one stays a moment for Sonner's exit animation, marked `data-removed`. */
function toasts(page: Page) {
  return page.getByRole("region", { name: /^Notifications/ }).locator('li[data-sonner-toast]:not([data-removed="true"])');
}

/** Share, with a clipboard that refuses: raises copyRefused. */
async function shareRefused(page: Page) {
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("Refused for the test"));
  });
  await page.getByRole("group", { name: "Settings" }).getByRole("button", { name: "Share" }).click();
}

/** Export an Image whose file cannot be fetched: raises imageFailed. */
async function failImage(page: Page) {
  // The Image's file is fetched from the URL plotly made; a fetch that rejects fails the Image.
  await page.evaluate(() => {
    window.fetch = () => Promise.reject(new Error("Refused for the test"));
  });
  await page.getByRole("button", { name: "Export image" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Download" }).click();
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${locator} has no box`);
  }
  return box;
}

test("a refused share link raises a toast at the top right, under the header and level with the cards, that stays until its close button closes it, and the header holds no notice", async ({ page }) => {
  await page.clock.install();
  await open(page, `${ISO_ADDRESS}?share=v1.not-base64-json`);

  const toast = toasts(page);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("The shared link could not be read, so nothing was opened from it.");
  const box = await boxOf(toast);
  const banner = page.getByRole("banner");
  const inputs = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Inputs", exact: true }) });
  const header = await boxOf(banner);
  // From the page's right edge, the header band's: the window less the scrollbar's gutter the root keeps.
  expect(header.x + header.width - (box.x + box.width)).toBeLessThanOrEqual(32);
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(box.y).toBeCloseTo((await boxOf(inputs)).y, 0);

  // Past Sonner's own four seconds, which a toast that times out would not outlive.
  await page.clock.fastForward(10_000);
  await expect(toast).toBeVisible();

  await expect(banner.getByRole("alert")).toHaveCount(0);
  await expect(banner.getByRole("status")).toHaveCount(0);

  await toast.getByRole("button", { name: "Close" }).click();
  await expect(toast).toHaveCount(0);
});

test("a link that needed something filled raises its toast", async ({ page }) => {
  await open(page, `${ISO_ADDRESS}?share=${FILLED_LINK}`);

  await expect(toasts(page)).toContainText("Some of this link could not be used as written; what it lacked starts at its defaults.");
});

test("a clipboard that refuses the link raises its toast, refusing again replaces it, and another notice stacks", async ({ page }) => {
  await open(page, PMV_ADDRESS);

  await shareRefused(page);
  await expect(toasts(page)).toContainText("The link could not be copied.");

  await shareRefused(page);
  // Another notice after the second refusal: once its toast stands, the refusal's has had its turn.
  await failImage(page);
  await expect(toasts(page)).toHaveCount(2);
  await expect(toasts(page).filter({ hasText: "The link could not be copied." })).toHaveCount(1);
});

test("Reset, answered yes, closes every toast standing", async ({ page }) => {
  await open(page, PMV_ADDRESS);
  await shareRefused(page);
  await expect(toasts(page)).toHaveCount(1);

  await page.getByRole("group", { name: "Settings" }).getByRole("button", { name: "Reset" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, reset" }).click();

  await expect(toasts(page)).toHaveCount(0);
});

test("a link's yes over a kept session raises the link's own toast", async ({ page }) => {
  // The first visit leaves the tab a kept session, so the link asks.
  await open(page, PMV_ADDRESS);
  await open(page, `${ISO_ADDRESS}?share=${FILLED_LINK}`);

  await page.getByRole("dialog").getByRole("button", { name: "Yes, open the link" }).click();

  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toContainText("Some of this link could not be used as written; what it lacked starts at its defaults.");
});

test("an Image that could not be made raises its toast", async ({ page }) => {
  await open(page, PMV_ADDRESS);

  await failImage(page);

  await expect(toasts(page)).toContainText("The image could not be made.");
});
