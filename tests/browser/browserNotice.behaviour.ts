import { expect, test } from "@playwright/test";

/**
 * A share link as Copy link writes it on the Standard page, to PMV (ISO 7730)
 * at its defaults. The notice's check reads nothing from the address, so
 * without `Proxy` or `toSorted` its text only has to look like one.
 */
const SHARE_ADDRESS =
  "/standard/iso-7730/pmv-ppd-iso?share=v1.eyJtb2RlbCI6InBtdl9wcGRfaXNvIiwidW5pdFN5c3RlbSI6InNpIiwicF9hdG0iOjEwMTMyNSwiY29tcGFyZSI6ZmFsc2UsImVuYWJsZWQiOltmYWxzZSxmYWxzZV0sImVudHJ5TW9kZXMiOnsidGVtcGVyYXR1cmUiOiJzZXBhcmF0ZSIsImFpclNwZWVkIjoiYWlyLXNwZWVkIiwiY2xvdGhpbmciOiJjbG90aGluZy1pbnN1bGF0aW9uIiwiaHVtaWRpdHkiOiJyZWxhdGl2ZS1odW1pZGl0eSJ9LCJzbG90cyI6W3sidmFsdWVzIjp7InRkYiI6MjUsInRyIjoyNSwidiI6MC4xLCJtZXQiOjEuMSwiY2xvIjowLjUsInJoIjo1MH0sIm9wdGlvbnMiOnt9fSxudWxsLG51bGxdLCJjaGFydHMiOnsicG12X3BwZF9pc28iOnsidHlwZSI6InBzeWNocm9tZXRyaWMiLCJheGVzIjp7IngiOiJ0ZGIiLCJ5IjoidiJ9fX19";

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

test("with Proxy and toSorted, a share link shows the app and never the notice", async ({ page }) => {
  await page.goto(SHARE_ADDRESS);

  await expect(page.locator("#app")).not.toBeEmpty();
  await expect(page.locator("#browser-notice")).toBeAttached();
  await expect(page.locator("#browser-notice")).toBeHidden();
});
