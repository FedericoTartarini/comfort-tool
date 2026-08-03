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

async function expectAxisTitles(plot: Locator, xTitle: string, yTitle: string) {
  await expect.poll(() => plot.evaluate((element) => {
    const layout = (element as HTMLElement & {
      _fullLayout?: {
        xaxis?: { title?: { text?: string } };
        yaxis?: { title?: { text?: string } };
      };
    })._fullLayout;
    return {
      x: layout?.xaxis?.title?.text ?? "",
      y: layout?.yaxis?.title?.text ?? "",
    };
  })).toEqual({
    x: expect.stringContaining(xTitle),
    y: expect.stringContaining(yTitle),
  });
}

async function openAdaptiveChart(
  page: Page,
  options: {
    model?: keyof typeof ADAPTIVE_MODEL_LABELS;
    useIpUnits?: boolean;
  } = {},
) {
  const {
    model = "ashrae",
    useIpUnits = false,
  } = options;

  await page.goto("/");
  await selectModel(page, model);
  await page.getByRole("checkbox", { name: "Enable input comparison" }).setChecked(false);
  const unitToggle = page.getByRole("checkbox", { name: "Use IP units" });
  await unitToggle.setChecked(useIpUnits, { force: true });
  const panel = page.getByTestId("comfort-chart-panel");
  await expect(page.getByRole("button", { name: "Select chart type and export" }))
    .toContainText("Adaptive");
  await expect(panel.getByRole("group", { name: "Chart mode" })).toBeHidden();
  await expect(panel.getByText("Compliance", { exact: true })).toBeVisible();
  await expect(panel.getByText(
    model === "ashrae"
      ? "Green shading shows the ASHRAE 55 80% and 90% acceptability regions; compliance is the 80% range from t_cmf − 3.5°C to t_cmf + 3.5°C, including the applicable upper-limit cooling adjustment."
      : "Shading shows EN 16798-1 Categories I–III; compliance is the Category III range from t_cmf − 5°C to t_cmf + 4°C, including the applicable upper-limit cooling adjustment.",
    { exact: true },
  )).toBeVisible();
  await expect(panel.getByLabel("Your input: Compliant")).toBeVisible();
  await expect(page.getByRole("button", { name: "Select chart X axis" }))
    .toContainText("Mean outdoor temperature");
  await expect(page.getByRole("button", { name: "Select chart Y axis" }))
    .toContainText("Operative temperature");
  await expect(page.getByRole("button", { name: "Select chart display output" }))
    .toBeHidden();
  await expect(page.getByRole("button", { name: "Edit chart thresholds" })).toBeHidden();

  const plot = page.getByTestId("comfort-chart-plot");
  const traceName = model === "ashrae"
    ? "80% Acceptability"
    : "Category III";
  await waitForAdaptiveTrace(plot, traceName);
  await expectAxisUnits(plot, useIpUnits ? "°F" : "°C");

  return {
    panel,
    plot,
    visual: page.getByTestId("comfort-chart-visual"),
  };
}

test.describe("Adaptive visual regression", () => {
  test("ASHRAE boundary chart in SI", async ({ page }) => {
    const { visual } = await openAdaptiveChart(page);
    await expect(visual).toContainText("Adaptive Zones");
    await expect(visual.getByText("80% Acceptability", { exact: true })).toHaveCount(1);
    await expect(visual.getByText("90% Acceptability", { exact: true })).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-ashrae-fixed-si.png");
  });

  test("EN boundary chart in SI", async ({ page }) => {
    const { visual } = await openAdaptiveChart(page, { model: "en" });
    await expect(visual).toContainText("Category I");
    await expect(visual.getByText("Category II", { exact: true })).toHaveCount(1);
    await expect(visual.getByText("Category III", { exact: true })).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-en-fixed-si.png");
  });

  test("ASHRAE boundary chart in IP", async ({ page }) => {
    const { visual } = await openAdaptiveChart(page, { useIpUnits: true });
    await expect(visual).toContainText("90% Acceptability");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-ashrae-fixed-ip.png");
  });

  test("ASHRAE chart transposes to operative-X/outdoor-Y", async ({ page }) => {
    const { plot, visual } = await openAdaptiveChart(page);
    const xTrigger = page.getByRole("button", { name: "Select chart X axis" });
    await xTrigger.click();
    await expect(page.getByRole("button", {
      name: "Mean outdoor temperature",
      exact: true,
    })).toBeVisible();
    await page.getByRole("button", {
      name: "Operative temperature",
      exact: true,
    }).click();
    await page.getByText("Inputs", { exact: true }).click();
    await expect(page.getByRole("button", {
      name: "Operative temperature",
      exact: true,
    })).toBeHidden();

    await expect(xTrigger).toContainText("Operative temperature");
    await expect(page.getByRole("button", { name: "Select chart Y axis" }))
      .toContainText("Mean outdoor temperature");
    await expectAxisTitles(
      plot,
      "Operative temperature",
      "Prevailing mean outdoor temperature",
    );
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("adaptive-ashrae-operative-x-si.png");
  });
});
