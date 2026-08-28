import { expect, test, type Page } from "@playwright/test";

async function openModelOptions(page: Page) {
  const modelSelect = page.getByRole("combobox", { name: "Select comfort model" });
  await modelSelect.click();
  return modelSelect;
}

async function chooseModel(page: Page, modelLabel: string) {
  const modelSelect = await openModelOptions(page);
  await modelSelect.fill(modelLabel);
  await page.getByRole("button", { name: modelLabel, exact: false }).click();
  return modelSelect;
}

async function expectSingleModelSelector(page: Page, modelLabel: string) {
  const modelSelect = page.getByRole("combobox", { name: "Select comfort model" });
  await expect(modelSelect).toBeEnabled();
  await modelSelect.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("button")).toHaveCount(1);
  const option = listbox.getByRole("button", { name: modelLabel, exact: false });
  await expect(option).toBeEnabled();
  await option.click();
  await expect(modelSelect).toHaveValue(modelLabel);
}

async function expectDesktopChartHeaderRows(page: Page) {
  const summary = page.getByTestId("chart-profile-summary");
  const toolbar = page.getByTestId("chart-toolbar");
  const caption = page.getByTestId("chart-profile-caption");
  await expect(summary).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(caption).toBeVisible();

  const summaryBox = await summary.boundingBox();
  const toolbarBox = await toolbar.boundingBox();
  const captionBox = await caption.boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(captionBox).not.toBeNull();
  expect(Math.abs(summaryBox!.y - toolbarBox!.y)).toBeLessThanOrEqual(2);
  expect(captionBox!.y).toBeGreaterThanOrEqual(Math.max(
    summaryBox!.y + summaryBox!.height,
    toolbarBox!.y + toolbarBox!.height,
  ));
}

test.describe("workspace routing", () => {
  test("redirects and canonicalizes public URLs without losing query or hash", async ({ page }) => {
    await page.goto("/?source=test#inputs-panel");
    await expect(page).toHaveURL(/\/standard\/ashrae-55\/pmv-ashrae\/\?source=test#inputs-panel$/);
    await expect(page.getByRole("button", { name: "Select chart type and export" }))
      .toContainText("Psychrometric");

    await page.goto("/STANDARD/ISO-7730?source=test#inputs-panel");
    await expect(page).toHaveURL(/\/standard\/iso-7730\/pmv-iso\/\?source=test#inputs-panel$/);
  });

  test("uses fixed-first chart defaults on fresh calculation routes", async ({ page }) => {
    for (const [path, chartName] of [
      ["/Standard/ASHRAE-55/", "Psychrometric"],
      ["/Standard/ISO-7730/", "Psychrometric"],
      ["/Standard/EN-16798-1/", "Adaptive"],
      ["/Standard/ISO-7933/", "Body Temperature"],
      ["/Explore/", "Psychrometric"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Select chart type and export" }))
        .toContainText(chartName);
    }
  });

  test("coordinates workspace through browser history", async ({ page }) => {
    await page.goto("/standard/ashrae-55/");
    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/pmv-ashrae\/$/);
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Explore",
      { exact: true },
    )).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/standard\/ashrae-55\/pmv-ashrae\/$/);
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/\/explore\/pmv-ashrae\/$/);
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Explore",
      { exact: true },
    )).toBeVisible();
  });

  test("keeps Compliance status and chart tools above a full-width caption", async ({ page }) => {
    await page.goto("/standard/ashrae-55/");
    await expect(page.getByLabel("Your input: Compliant")).toBeVisible();
    await expectDesktopChartHeaderRows(page);

    const modelSelect = await chooseModel(page, "Adaptive (ASHRAE-55)");
    await expect(modelSelect).toHaveValue("Adaptive (ASHRAE-55)");
    await expect(page).toHaveURL(/\/standard\/ashrae-55\/adaptive-ashrae\/$/);
    await expect(page.getByLabel("Your input: Compliant")).toBeVisible();
    await expectDesktopChartHeaderRows(page);

    const controlBoxes = await Promise.all([
      page.getByRole("button", { name: "Select chart X axis" }).boundingBox(),
      page.getByRole("button", { name: "Select chart Y axis" }).boundingBox(),
      page.getByRole("button", { name: "Select chart type and export" }).boundingBox(),
    ]);
    expect(controlBoxes.every((box) => box !== null)).toBe(true);
    const controlTops = controlBoxes.map((box) => box!.y);
    expect(Math.max(...controlTops) - Math.min(...controlTops)).toBeLessThanOrEqual(2);
  });

  test("derives exact model choices and forces the workspace route", async ({ page }) => {
    await page.goto("/standard/ashrae-55/");
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

    await page.goto("/standard/iso-7730/");
    await expectSingleModelSelector(page, "PMV (ISO 7730 Category B)");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();

    await page.goto("/standard/en-16798-1/");
    await expectSingleModelSelector(page, "Adaptive (EN 16798-1)");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();

    await page.goto("/standard/iso-7933/");
    await expectSingleModelSelector(page, "PHS (ISO 7933:2023)");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();

    await page.goto("/Explore/");
    await openModelOptions(page);
    for (const modelLabel of [
      "PMV (ASHRAE-55)",
      "PMV (ISO 7730 Category B)",
      "UTCI",
      "Heat Index",
      "Humidex",
      "Wind Chill",
      "PHS (ISO 7933:2023)",
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
    await expect(page.getByRole("button", { name: "Select chart output" }))
      .toBeVisible();
  });

  test("uses each Explore model's declared first chart", async ({ page }) => {
    await page.goto("/Explore/");
    const chartTrigger = page.getByRole("button", {
      name: "Select chart type and export",
    });
    await expect(chartTrigger).toContainText("Psychrometric");

    for (const [modelLabel, chartName] of [
      ["PMV (ISO 7730 Category B)", "Psychrometric"],
      ["UTCI", "UTCI"],
      ["Heat Index", "Dynamic"],
      ["Humidex", "Dynamic"],
    ] as const) {
      const modelSelect = await chooseModel(page, modelLabel);
      await expect(modelSelect).toHaveValue(modelLabel);
      await expect(chartTrigger).toContainText(chartName);
    }

    const windChillSelect = await chooseModel(page, "Wind Chill");
    await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Yes, switch and adjust" }).click();
    await expect(windChillSelect).toHaveValue("Wind Chill");
    await expect(page).toHaveURL(/\/explore\/wind-chill\/$/);
    await expect(chartTrigger).toContainText("Dynamic");
  });

  test("keeps dashboard state through leaf workspaces and hides unsupported export", async ({ page }) => {
    await page.goto("/standard/ashrae-55/?state=stale");
    const temperature = page.getByLabel("Input 1 Air temperature", { exact: true });
    await temperature.fill("24");
    await temperature.press("Enter");

    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/pmv-ashrae\/$/);
    await expect(temperature).toHaveValue("24.0");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Explore",
      { exact: true },
    )).toBeVisible();

    await page.getByRole("link", { name: "Time-series", exact: true }).click();
    await expect(page).toHaveURL(/\/time-series\/phs-2023\/$/);
    await expect(page.getByRole("heading", { name: "Time-series" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Link" })).toBeHidden();
    await expect(page.getByRole("combobox", { name: "Select comfort model" })).toBeHidden();

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await expect(page).toHaveURL(/\/standard\/ashrae-55\/pmv-ashrae\/$/);
    await expect(page.getByLabel("Input 1 Air temperature", { exact: true }))
      .toHaveValue("24.0");

    await page.goto("/standard/ashrae-55/utci/");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    await page.goto("/does-not-exist/");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Link" })).toBeHidden();
    await expect(page.getByRole("link", { name: "Return to ASHRAE 55" })).toBeVisible();
  });

  test("uses a mobile Drawer and closes it after navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/standard/ashrae-55/");
    await page.getByRole("button", { name: "Open workspace navigation" }).click();
    const drawer = page.locator("#workspace-navigation-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/pmv-ashrae\/$/);
    await expect(drawer).toBeHidden();

    const summaryBox = await page.getByTestId("chart-profile-summary").boundingBox();
    const captionBox = await page.getByTestId("chart-profile-caption").boundingBox();
    const toolbarBox = await page.getByTestId("chart-toolbar").boundingBox();
    expect(summaryBox).not.toBeNull();
    expect(captionBox).not.toBeNull();
    expect(toolbarBox).not.toBeNull();
    expect(captionBox!.y).toBeGreaterThan(summaryBox!.y);
    expect(toolbarBox!.y).toBeGreaterThan(captionBox!.y);
    await expect.poll(() => page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))).toEqual({ clientWidth: 390, scrollWidth: 390 });
  });

  test("holds a guarded route change until warning confirmation", async ({ page }) => {
    await page.goto("/Explore/");
    const modelSelect = await openModelOptions(page);
    await modelSelect.fill("Wind Chill");
    await page.getByRole("button", { name: "Wind Chill", exact: false }).click();
    await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Yes, switch and adjust" }).click();
    await expect(modelSelect).toHaveValue("Wind Chill");
    await expect(page).toHaveURL(/\/explore\/wind-chill\/$/);

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/wind-chill\/$/);
    await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "No, stay here" }).click();
    await expect(page).toHaveURL(/\/explore\/wind-chill\/$/);
    await expect(modelSelect).toHaveValue("Wind Chill");

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await page.getByRole("button", { name: "Yes, switch and adjust" }).click();
    await expect(page).toHaveURL(/\/standard\/ashrae-55\/pmv-ashrae\/$/);
    await expect(page.getByRole("combobox", { name: "Select comfort model" }))
      .toHaveValue("PMV (ASHRAE-55)");
    await expect(page.getByTestId("comfort-chart-panel").getByText(
      "Compliance",
      { exact: true },
    )).toBeVisible();
  });

  test("collapses the desktop workspace navigation to a left rail", async ({ page }) => {
    await page.goto("/standard/ashrae-55/");
    const rail = page.getByTestId("workspace-navigation-rail");
    await expect(rail.getByRole("link", { name: "Explore", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Collapse workspace navigation" }).click();
    await expect.poll(() => rail.evaluate((element) => element.getBoundingClientRect().width))
      .toBeLessThan(80);
    await expect(rail.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
    await expect(rail.getByRole("link", { name: "Time-series", exact: true })).toBeVisible();
    await expect(rail.getByRole("link", { name: "Standard", exact: true })).toBeVisible();

    await rail.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/pmv-ashrae\/$/);

    await rail.getByRole("link", { name: "Standard", exact: true }).click();
    await expect(page).toHaveURL(/\/standard\/ashrae-55\/pmv-ashrae\/$/);

    await page.getByRole("button", { name: "Expand workspace navigation" }).click();
    await expect(rail.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
    await expect(rail.getByRole("button", { name: "Standard", exact: true })).toBeVisible();
  });
});
