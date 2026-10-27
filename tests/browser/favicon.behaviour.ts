import { expect, test } from "@playwright/test";

/**
 * The tab carries the deployed CBE tool's favicon, served from
 * `public/brand-media/`. A path the dev server does not know answers 200 with
 * the page, so the request is held to its content type too.
 */
test("the page's head links the CBE favicon as a PNG the server answers, and loading the page logs no error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto("/");

  const icon = page.locator('head link[rel="icon"]');
  await expect(icon).toHaveAttribute("type", "image/png");
  await expect(icon).toHaveAttribute("href", /\/brand-media\/favico\.png$/);

  const response = await page.request.get((await icon.getAttribute("href")) ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(errors).toEqual([]);
});
