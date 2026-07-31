import { expect, test, type Locator, type Page } from "@playwright/test";

const ADAPTIVE_MODEL_LABELS = {
  ashrae: "Adaptive (ASHRAE-55)",
  en: "Adaptive (EN 16798-1)",
} as const;

async function selectModel(
  page: Page,
  model: keyof typeof ADAPTIVE_MODEL_LABELS,
) {
  const modelLabel = ADAPTIVE_MODEL_LABELS[model];
  const modelSelect = page.getByRole("combobox", { name: "Select comfort model" });
  await modelSelect.click();
  await modelSelect.fill(modelLabel);
  await page.getByRole("button", { name: modelLabel, exact: false }).click();
  await expect(modelSelect).toHaveValue(modelLabel);
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

async function waitForAdaptiveTrace(plot: Locator, traceName: string) {
  await expect(plot).toHaveClass(/js-plotly-plot/);
  await expect.poll(() => plot.evaluate((element, expectedName) => {
    const traces = (element as HTMLElement & {
      data?: Array<{ name?: string; x?: number[]; y?: number[] }>;
    }).data ?? [];
    return traces.some(({ name, x, y }) => (
      name === expectedName && (x?.length ?? 0) > 1 && (y?.length ?? 0) > 1
    ));
  }, traceName)).toBe(true);
}

async function expectAxisUnits(plot: Locator, unit: "°C" | "°F") {
  await expect.poll(() => plot.evaluate((element) => {
    const layout = (element as HTMLElement & {
      _fullLayout?: {
        xaxis?: { title?: { text?: string } };
        yaxis?: { title?: { text?: string } };
      };
    })._fullLayout;
    return [
      layout?.xaxis?.title?.text ?? "",
      layout?.yaxis?.title?.text ?? "",
    ];
  })).toEqual([
    expect.stringContaining(unit),
    expect.stringContaining(unit),
  ]);
}

async function openAdaptiveChart(
  page: Page,
  options: {
    model?: keyof typeof ADAPTIVE_MODEL_LABELS;
    dynamic?: boolean;
    useIpUnits?: boolean;
  } = {},
) {
  const {
    model = "ashrae",
    dynamic = false,
    useIpUnits = false,
  } = options;

  await page.goto("/");
  await selectModel(page, model);
  await page.getByRole("checkbox", { name: "Enable input comparison" }).setChecked(false);
  const unitToggle = page.getByRole("checkbox", { name: "Use IP units" });
  await unitToggle.setChecked(useIpUnits, { force: true });
  const panel = page.getByTestId("comfort-chart-panel");
  if (dynamic) {
    await expect(page.getByRole("button", { name: "Select chart type and export" }))
      .toContainText("Dynamic");
    await expect(panel.getByRole("group", { name: "Chart mode" })).toBeHidden();
    await expect(panel.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(panel.getByText(
      model === "ashrae"
        ? "ASHRAE 55 adaptive acceptability limits are locked for this chart."
        : "EN 16798-1 Category III limits are locked for this chart.",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByRole("button", { name: "Select chart X axis" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select chart Y axis" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select chart display output" }))
      .toBeHidden();
    await expect(page.getByRole("button", { name: "Edit chart thresholds" })).toBeHidden();
  } else {
    await selectChart(page, "Adaptive");
    await expect(panel.getByRole("group", { name: "Chart mode" })).toBeHidden();
    await expect(panel.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(panel.getByText(
      model === "ashrae"
        ? "ASHRAE 55 adaptive acceptability limits are locked for this chart."
        : "EN 16798-1 Category III limits are locked for this chart.",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByRole("button", { name: "Select chart X axis" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Select chart Y axis" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Select chart display output" }))
      .toBeHidden();
    await expect(page.getByRole("button", { name: "Edit chart thresholds" })).toBeHidden();
  }

  const plot = page.getByTestId("comfort-chart-plot");
  const traceName = dynamic
    ? "Too Cool"
    : model === "ashrae"
      ? "80% Acceptability"
      : "Category III";
  await waitForAdaptiveTrace(plot, traceName);
  await expectAxisUnits(plot, useIpUnits ? "°F" : "°C");

  return page.getByTestId("comfort-chart-visual");
}

test.describe("Adaptive visual regression", () => {
  test("ASHRAE fixed boundary chart in SI", async ({ page }) => {
    const visual = await openAdaptiveChart(page);
    await expect(visual).toContainText("Adaptive Zones");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-ashrae-fixed-si.png");
  });

  test("EN fixed boundary chart in SI", async ({ page }) => {
    const visual = await openAdaptiveChart(page, { model: "en" });
    await expect(visual).toContainText("Category I");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-en-fixed-si.png");
  });

  test("ASHRAE dynamic boundary chart in SI", async ({ page }) => {
    const visual = await openAdaptiveChart(page, { dynamic: true });
    await expect(visual).toContainText("Too Cool");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-ashrae-dynamic-si.png");
  });

  test("ASHRAE fixed boundary chart in IP", async ({ page }) => {
    const visual = await openAdaptiveChart(page, { useIpUnits: true });
    await expect(visual).toContainText("90% Acceptability");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-ashrae-fixed-ip.png");
  });
});
