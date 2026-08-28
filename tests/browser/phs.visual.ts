import { expect, test, type Locator, type Page } from "@playwright/test";

async function selectPHS(page: Page) {
  const modelSelect = page.getByRole("combobox", { name: "Select comfort model" });
  await modelSelect.click();
  await modelSelect.fill("PHS");
  await page.getByRole("button", { name: "PHS (ISO 7933:2023)", exact: false }).click();
  await expect(modelSelect).toHaveValue("PHS (ISO 7933:2023)");
}

async function selectChart(page: Page, chartLabel: string) {
  const trigger = page.getByRole("button", {
    name: "Select chart type and export",
  });
  await trigger.click();
  const option = page.getByRole("button", { name: chartLabel, exact: true });
  await option.click();
  await expect(trigger).toContainText(chartLabel);
  await page.mouse.click(1, 1);
  await expect(option).toBeHidden();
}

async function traceNames(plot: Locator) {
  await expect(plot).toHaveClass(/js-plotly-plot/);
  return plot.evaluate((element) => (
    (element as HTMLElement & { data?: Array<{ name?: string }> }).data
      ?.map(({ name }) => name) ?? []
  ));
}

test("PHS Standard defaults to locked exposure history and retains Dynamic", async ({ page }) => {
  await page.goto("/standard/iso-7933/");
  const plot = page.getByTestId("comfort-chart-plot");
  const chartTrigger = page.getByRole("button", {
    name: "Select chart type and export",
  });

  await expect(chartTrigger).toContainText("Body Temperature");
  await expect(page.getByRole("button", { name: "Edit chart thresholds" }))
    .toBeHidden();
  await expect(page.getByRole("button", { name: "Select chart X axis" }))
    .toBeHidden();
  await expect.poll(() => traceNames(plot)).toEqual(expect.arrayContaining([
    "Rectal temperature",
    "Core temperature",
    "Maximum rectal temperature",
  ]));
  await expect(page.getByTestId("comfort-chart-visual"))
    .toHaveScreenshot("phs-exposure-history-compliance-si.png");

  await selectChart(page, "Dynamic");
  await expect(page.getByRole("button", { name: "Select chart X axis" }))
    .toBeVisible();
  await expect.poll(() => plot.evaluate((element) => (
    (element as HTMLElement & { data?: Array<{ type?: string }> }).data
      ?.some(({ type }) => type === "contour") ?? false
  ))).toBe(true);
  await expect(page.getByTestId("comfort-chart-visual"))
    .toHaveScreenshot("phs-dynamic-compliance-si.png");
});

test("PHS Explore edits the exposure threshold and exposes all Dynamic outputs", async ({ page }) => {
  await page.goto("/Explore/");
  await selectPHS(page);
  const plot = page.getByTestId("comfort-chart-plot");

  await expect(page.getByRole("button", { name: "Select chart type and export" }))
    .toContainText("Body Temperature");
  await expect(page.getByRole("button", { name: "Select chart output" })).toBeHidden();
  await page.getByRole("button", { name: "Edit chart thresholds" }).click();
  await page.getByLabel("Band 1 upper bound").fill("37.5");
  await page.getByLabel("Band 2 lower bound").fill("37.5");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => plot.evaluate((element) => {
    const trace = (element as HTMLElement & {
      data?: Array<{ name?: string; y?: number[] }>;
    }).data?.find(({ name }) => name === "Editable rectal-temperature threshold");
    return trace?.y ?? [];
  })).toEqual([37.5, 37.5]);

  await selectChart(page, "Dynamic");
  await expect(page.getByRole("button", { name: "Select chart output" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select chart X axis" })).toBeVisible();
});
