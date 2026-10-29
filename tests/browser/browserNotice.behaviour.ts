import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";

/**
 * A share link as Share writes it on the Standard page, to PMV (ISO 7730)
 * at its defaults, deflated by Node's own zlib. The notice's check reads
 * nothing from the address, so without `Proxy` or `toSorted` its text only
 * has to look like one.
 */
const SHARE_ADDRESS = `/standard/iso-7730-2025/pmv-ppd-iso?share=v1.${deflateRawSync(
  JSON.stringify({
    model: "pmv_ppd_iso",
    unitSystem: "si",
    p_atm: 101325,
    compare: false,
    enabled: [false, false],
    entryModes: { temperature: "separate", airSpeed: "air-speed", clothing: "clothing-insulation", humidity: "relative-humidity" },
    slots: [{ values: { tdb: 25, tr: 25, v: 0.1, met: 1.1, clo: 0.5, rh: 50 }, options: {} }, null, null],
    charts: { pmv_ppd_iso: { type: "psychrometric", axes: { x: "tdb", y: "v" } } },
  }),
).toString("base64url")}`;

/** What a person opens: the tool itself, or a share link to it. */
const openings = [
  { name: "the tool", address: "/" },
  { name: "a share link", address: SHARE_ADDRESS },
];

/**
 * What the tool needs and the check in `index.html` looks for: `Proxy` (Svelte
 * 5) and `Array.prototype.toSorted` (sv-router, on every route match), each
 * removed before any page script runs.
 */
const missingFeatures = [
  {
    name: "Proxy",
    remove: () => {
      // @ts-expect-error The point is a window that has no Proxy.
      delete window.Proxy;
    },
  },
  {
    name: "toSorted",
    remove: () => {
      // @ts-expect-error The point is an Array that has no toSorted.
      delete Array.prototype.toSorted;
    },
  },
];

/**
 * The static notice `index.html` shows a browser below the tool's floor
 * (ADR-0001 §2, §7 criterion 5). A browser without `Proxy` skips the module
 * entry; a modern one with a feature removed runs it and fails on its own, so
 * these cases also prove the notice survives the app's failure.
 */
for (const feature of missingFeatures) {
  for (const { name, address } of openings) {
    test(`without ${feature.name}, ${name} shows the notice and leaves the app empty`, async ({ page }) => {
      await page.addInitScript(feature.remove);
      await page.goto(address);

      await expect(page.locator("#browser-notice")).toBeVisible();
      await expect(page.locator("#browser-notice")).toContainText("Chrome 111, Firefox 115 or Safari 16.4");
      await expect(page.locator("#app")).toBeEmpty();
    });
  }
}

test("with Proxy and toSorted, a share link shows the app on the model it names, never the default, and never the notice", async ({ page }) => {
  await page.goto(SHARE_ADDRESS);

  await expect(page.locator("#app")).not.toBeEmpty();
  await expect(page.getByRole("button", { name: "Model", exact: true })).toHaveText("PMV / PPD (ISO 7730)");
  await expect(page).toHaveURL((url) => url.pathname === "/standard/iso-7730-2025/pmv-ppd-iso");
  await expect(page.locator("#browser-notice")).toBeAttached();
  await expect(page.locator("#browser-notice")).toBeHidden();
});
