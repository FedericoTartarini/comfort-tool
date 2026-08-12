import { expect, test, type Page } from "@playwright/test";

async function openModelOptions(page: Page) {
  const modelSelect = page.getByRole("combobox", { name: "Select comfort model" });
  await modelSelect.click();
  return modelSelect;
}

test.describe("workspace routing", () => {
  test("redirects and canonicalizes public URLs without losing query or hash", async ({ page }) => {
    await page.goto("/?source=test#inputs-panel");
    await expect(page).toHaveURL(/\/ASHRAE-55\/\?source=test#inputs-panel$/);

    await page.goto("/ISO-7730?source=test#inputs-panel");
    await expect(page).toHaveURL(/\/ISO-7730\/\?source=test#inputs-panel$/);
  });

  test("coordinates workspace mode through browser history", async ({ page }) => {
    await page.goto("/ASHRAE-55/");
    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/Explore\/$/);
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Explore",
      { exact: true },
    )).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/ASHRAE-55\/$/);
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/Explore\/$/);
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Explore",
      { exact: true },
    )).toBeVisible();
  });

  test("derives exact model choices and forces the workspace mode", async ({ page }) => {
    await page.goto("/ASHRAE-55/");
    const activeStandardLink = page.getByRole("link", { name: "ASHRAE 55", exact: true });
    await expect(activeStandardLink).toHaveAttribute("aria-current", "page");
    const standardToggle = page.getByRole("button", { name: "Standard", exact: true });
    await standardToggle.click();
    await expect(activeStandardLink).toBeHidden();
    await standardToggle.click();
    await expect(activeStandardLink).toBeVisible();

    const ashraeSelect = await openModelOptions(page);
    await expect(page.getByRole("button", { name: "PMV (ASHRAE-55)", exact: false }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "Adaptive (ASHRAE-55)", exact: false }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "PMV (ISO 7730 Category B)", exact: false }))
      .toBeHidden();
    await page.keyboard.press("Escape");
    await expect(ashraeSelect).toHaveValue("PMV (ASHRAE-55)");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByRole("group", { name: "Chart mode" })).toBeHidden();

    await page.goto("/ISO-7730/");
    const isoSelect = page.getByRole("combobox", { name: "Select comfort model" });
    await expect(isoSelect).toBeDisabled();
    await expect(isoSelect).toHaveValue("PMV (ISO 7730 Category B)");

    await page.goto("/Explore/");
    await openModelOptions(page);
    for (const modelLabel of [
      "PMV (ASHRAE-55)",
      "PMV (ISO 7730 Category B)",
      "UTCI",
      "Heat Index",
      "Humidex",
      "Wind Chill",
    ]) {
      await expect(page.getByRole("button", { name: modelLabel, exact: false }))
        .toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Adaptive (ASHRAE-55)", exact: false }))
      .toBeHidden();
    await expect(page.getByRole("button", { name: "Adaptive (EN 16798-1)", exact: false }))
      .toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Explore",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByRole("button", { name: "Select chart display output" }))
      .toBeVisible();
  });

  test("keeps dashboard state through leaf workspaces and hides unsupported export", async ({ page }) => {
    await page.goto("/ASHRAE-55/?state=stale");
    const temperature = page.getByLabel("Input 1 Air temperature", { exact: true });
    await temperature.fill("24");
    await temperature.press("Enter");

    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/Explore\/$/);
    await expect(temperature).toHaveValue("24.0");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Explore",
      { exact: true },
    )).toBeVisible();

    await page.getByRole("link", { name: "Time-series", exact: true }).click();
    await expect(page).toHaveURL(/\/Time-Series\/$/);
    await expect(page.getByRole("heading", { name: "Time-series" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Link" })).toBeHidden();
    await expect(page.getByRole("combobox", { name: "Select comfort model" })).toBeHidden();

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await expect(page).toHaveURL(/\/ASHRAE-55\/$/);
    await expect(page.getByLabel("Input 1 Air temperature", { exact: true }))
      .toHaveValue("24.0");

    await page.goto("/does-not-exist/");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Link" })).toBeHidden();
    await expect(page.getByRole("link", { name: "Return to ASHRAE 55" })).toBeVisible();
  });

  test("uses a mobile Drawer and closes it after navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ASHRAE-55/");
    await page.getByRole("button", { name: "Open workspace navigation" }).click();
    const drawer = page.locator("#workspace-navigation-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/Explore\/$/);
    await expect(drawer).toBeHidden();
  });

  test("holds a guarded route change until warning confirmation", async ({ page }) => {
    await page.goto("/Explore/");
    const modelSelect = await openModelOptions(page);
    await modelSelect.fill("Wind Chill");
    await page.getByRole("button", { name: "Wind Chill", exact: false }).click();
    await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Yes, switch and adjust" }).click();
    await expect(modelSelect).toHaveValue("Wind Chill");

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await expect(page).toHaveURL(/\/Explore\/$/);
    await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "No, stay here" }).click();
    await expect(page).toHaveURL(/\/Explore\/$/);
    await expect(modelSelect).toHaveValue("Wind Chill");

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await page.getByRole("button", { name: "Yes, switch and adjust" }).click();
    await expect(page).toHaveURL(/\/ASHRAE-55\/$/);
    await expect(page.getByRole("combobox", { name: "Select comfort model" }))
      .toHaveValue("PMV (ASHRAE-55)");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();
  });
});
