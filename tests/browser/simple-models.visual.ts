import { expect, test, type Locator, type Page } from "@playwright/test";

async function selectModel(page: Page, modelLabel: string) {
  const modelSelect = page.getByRole("combobox", { name: "Select comfort model" });
  await modelSelect.click();
  await modelSelect.fill(modelLabel);
  await page.getByRole("button", { name: modelLabel, exact: false }).click();
  return modelSelect;
}

async function selectChart(page: Page, chartLabel: string) {
  const trigger = page.getByRole("button", { name: "Select chart type and export" });
  await trigger.click();
  const option = page.getByRole("button", { name: chartLabel, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(trigger).toContainText(chartLabel);
  await page.mouse.click(1, 1);
  await expect(option).toBeHidden();
}

async function expectAxisControls(page: Page, visible: boolean) {
  const controls = [
    page.getByRole("button", { name: "Select chart X axis" }),
    page.getByRole("button", { name: "Select chart Y axis" }),
  ];

  for (const control of controls) {
    if (visible) {
      await expect(control).toBeVisible();
    } else {
      await expect(control).toBeHidden();
    }
  }
}

async function expectSingleOutputExploreControls(page: Page) {
  await expect(page.getByRole("button", { name: "Select chart output" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Edit chart thresholds" })).toBeVisible();
}

async function expectRenderedContour(plot: Locator) {
  await expect(plot).toHaveClass(/js-plotly-plot/);
  await expect.poll(() => plot.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const traces = (element as HTMLElement & {
      data?: Array<{ type?: string; z?: number[][] }>;
    }).data ?? [];
    const contour = traces.find((trace) => trace.type === "contour");

    return {
      hasFiniteGrid: contour?.z?.some((row) => row.some(Number.isFinite)) ?? false,
      height: Math.round(bounds.height),
      width: Math.round(bounds.width),
    };
  })).toEqual({
    hasFiniteGrid: true,
    height: 480,
    width: expect.any(Number),
  });
  await expect.poll(() => plot.locator(".contourlayer path").count()).toBeGreaterThan(0);
}

for (const modelLabel of ["Heat Index", "Humidex"]) {
  test(`${modelLabel} switches between Psychrometric and Dynamic controls`, async ({ page }) => {
    await page.goto("/Explore/");
    const modelSelect = await selectModel(page, modelLabel);
    await expect(modelSelect).toHaveValue(modelLabel);

    const plot = page.getByTestId("comfort-chart-plot");
    const panel = page.getByTestId("comfort-chart-panel");
    const chartTrigger = page.getByRole("button", {
      name: "Select chart type and export",
    });

    await expect(chartTrigger).toContainText("Psychrometric");
    await expect(page.getByRole("group", { name: "Chart mode" })).toBeHidden();
    await expect(panel.getByText("Explore", { exact: true })).toBeVisible();
    await expect(panel.getByText(
      `Showing ${modelLabel} on this chart's fixed axes with editable thresholds.`,
      { exact: true },
    )).toBeVisible();
    await expectAxisControls(page, false);
    await expectSingleOutputExploreControls(page);
    await expectRenderedContour(plot);

    await selectChart(page, "Dynamic");
    await expect(panel.getByText("Explore", { exact: true })).toBeVisible();
    await expectAxisControls(page, true);
    await expectSingleOutputExploreControls(page);
    await expectRenderedContour(plot);

    await selectChart(page, "Psychrometric");
    await expect(panel.getByText("Explore", { exact: true })).toBeVisible();
    await expectAxisControls(page, false);
    await expectSingleOutputExploreControls(page);
    await expectRenderedContour(plot);
  });
}

test("UTCI fixed stress chart keeps Explore thresholds while locking axes", async ({
  page,
}) => {
  await page.goto("/Explore/");
  const modelSelect = await selectModel(page, "UTCI");
  await expect(modelSelect).toHaveValue("UTCI");

  await expect(page.getByRole("button", { name: "Select chart type and export" }))
    .toContainText("UTCI");
  const panel = page.getByTestId("comfort-chart-panel");
  await expect(panel.getByText("Explore", { exact: true })).toBeVisible();
  await expect(panel.getByText(
    "Showing UTCI on this chart's fixed axes with editable thresholds.",
    { exact: true },
  )).toBeVisible();
  await expectAxisControls(page, false);
  await expectSingleOutputExploreControls(page);
  await expectRenderedContour(page.getByTestId("comfort-chart-plot"));
  await expect(page.getByTestId("comfort-chart-visual"))
    .toContainText("Extreme Cold Stress");
});

test("Wind Chill completes the boundary-confirmed model switch", async ({ page }) => {
  await page.goto("/Explore/");
  const modelSelect = await selectModel(page, "Wind Chill");

  await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yes, switch and adjust" }).click();

  await expect(modelSelect).toHaveValue("Wind Chill");
  await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Input 1 Air temperature", { exact: true })).toHaveValue("0.0");
  await expect(page.getByTestId("comfort-chart-panel").getByText(
    "Explore",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("group", { name: "Chart mode" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Select chart type and export" }))
    .toContainText("Dynamic");
  await expectAxisControls(page, true);
  await expectSingleOutputExploreControls(page);
  await expectRenderedContour(page.getByTestId("comfort-chart-plot"));
});
