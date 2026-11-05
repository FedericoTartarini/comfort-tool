import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The footer names the version of the library package the lock installs,
 * read here from that package's file by its path, as the build reads it.
 */
const installedLibraryVersion: string = JSON.parse(
  readFileSync(new URL("../../node_modules/jsthermalcomfort/package.json", import.meta.url), "utf8"),
).version;

test("the footer names the installed library package's version", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("contentinfo")).toContainText(`jsthermalcomfort ${installedLibraryVersion}`);
});
