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
  await page.getByRole("button", { name: chartLabel, exact: true }).click();
  await trigger.click();
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
  test(`${modelLabel} renders non-empty Static and Dynamic charts`, async ({ page }) => {
    await page.goto("/");
    const modelSelect = await selectModel(page, modelLabel);
    await expect(modelSelect).toHaveValue(modelLabel);

    const plot = page.getByTestId("comfort-chart-plot");
    await expectRenderedContour(plot);

    await selectChart(page, "Dynamic");
    await expectRenderedContour(plot);
  });
}

test("Wind Chill completes the boundary-confirmed model switch", async ({ page }) => {
  await page.goto("/");
  const modelSelect = await selectModel(page, "Wind Chill");

  await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yes, switch and adjust" }).click();

  await expect(modelSelect).toHaveValue("Wind Chill");
  await expect(page.getByText("Boundary Range Warning", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Input 1 Air temperature", { exact: true })).toHaveValue("0.0");
  await expectRenderedContour(page.getByTestId("comfort-chart-plot"));
});
