import { expect, test } from "@playwright/test";

/**
 * A share link as Copy link writes it on the Standard page, to PMV (ISO 7730)
 * at its defaults. The notice's check reads nothing from the address, so
 * without `Proxy` its text only has to look like one.
 */
const SHARE_ADDRESS =
  "/standard/iso-7730/pmv-ppd-iso?share=v1.eyJtb2RlbCI6InBtdl9wcGRfaXNvIiwidW5pdFN5c3RlbSI6InNpIiwicF9hdG0iOjEwMTMyNSwiY29tcGFyZSI6ZmFsc2UsImVuYWJsZWQiOltmYWxzZSxmYWxzZV0sImVudHJ5TW9kZXMiOnsidGVtcGVyYXR1cmUiOiJzZXBhcmF0ZSIsImFpclNwZWVkIjoiYWlyLXNwZWVkIiwiY2xvdGhpbmciOiJjbG90aGluZy1pbnN1bGF0aW9uIiwiaHVtaWRpdHkiOiJyZWxhdGl2ZS1odW1pZGl0eSJ9LCJzbG90cyI6W3sidmFsdWVzIjp7InRkYiI6MjUsInRyIjoyNSwidiI6MC4xLCJtZXQiOjEuMSwiY2xvIjowLjUsInJoIjo1MH0sIm9wdGlvbnMiOnt9fSxudWxsLG51bGxdLCJjaGFydHMiOnsicG12X3BwZF9pc28iOnsidHlwZSI6InBzeWNocm9tZXRyaWMiLCJheGVzIjp7IngiOiJ0ZGIiLCJ5IjoidiJ9fX19";

/** What a person opens: the tool itself, or a share link to it. */
const openings = [
  { name: "the tool", address: "/" },
  { name: "a share link", address: SHARE_ADDRESS },
];

/**
 * The static notice `index.html` shows a browser without `Proxy` (ADR-0001 §2,
 * §7 criterion 5). Such a browser skips the module entry; a modern one with
 * `Proxy` removed runs it and fails on its own, so these cases also prove the
 * notice survives the app's failure.
 */
for (const { name, address } of openings) {
  test(`without Proxy, ${name} shows the notice and leaves the app empty`, async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error The point is a window that has no Proxy.
      delete window.Proxy;
    });
    await page.goto(address);

    await expect(page.locator("#browser-notice")).toBeVisible();
    await expect(page.locator("#browser-notice")).toContainText("Chrome 87, Firefox 83 or Safari 14");
    await expect(page.locator("#app")).toBeEmpty();
  });
}

test("with Proxy, a share link shows the app and never the notice", async ({ page }) => {
  await page.goto(SHARE_ADDRESS);

  await expect(page.locator("#app")).not.toBeEmpty();
  await expect(page.locator("#browser-notice")).toBeAttached();
  await expect(page.locator("#browser-notice")).toBeHidden();
});
