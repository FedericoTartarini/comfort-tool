import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";

const TARGET_INPUTS = {
  "Air temperature": "26",
  "Radiant temperature": "25",
  "Relative air speed": "0.10",
  "Relative humidity": "50",
  "Metabolic rate": "1.0",
  "Clothing insulation": "0.51",
} as const;

const PMV_COLORS = [
  "#0571b0",
  "#4c78a8",
  "#92c5de",
  "#f2f2f2",
  "#f4a582",
  "#e15759",
  "#cc79a7",
];

const PMV_FILL_CONSTRAINTS = [
  { operation: ">=", value: -2.5 },
  { operation: "][", value: [-2.5, -1.5] },
  { operation: "][", value: [-1.5, -0.5] },
  { operation: "][", value: [-0.5, 0.5] },
  { operation: "][", value: [0.5, 1.5] },
  { operation: "][", value: [1.5, 2.5] },
  { operation: "<", value: 2.5 },
] as const;

const MODEL_LABELS = {
  ashrae: "PMV (ASHRAE-55)",
  iso: "PMV (ISO 7730 Category B)",
} as const;

type PmvModel = keyof typeof MODEL_LABELS;
type PmvDisplay = "PMV" | "PPD (%)";

interface TargetChartOptions {
  model?: PmvModel;
  display?: PmvDisplay;
  useIpUnits?: boolean;
}

async function selectDropdownOption(
  page: Page,
  triggerName: string,
  optionName: string,
) {
  await page.getByRole("button", { name: triggerName }).click();
  await page.getByRole("button", { name: optionName, exact: true }).click();
  // Flowbite keeps these dropdowns open after choosing an item. Toggle the
  // same trigger so the screenshot contains only the chart under test.
  await page.getByRole("button", { name: triggerName }).click();
}

async function selectModel(page: Page, model: PmvModel) {
  const modelSelect = page.getByRole("combobox", { name: "Select comfort model" });
  const modelLabel = MODEL_LABELS[model];
  await modelSelect.click();
  await modelSelect.fill(modelLabel);
  await page.getByRole("button", { name: modelLabel, exact: false }).click();
  await expect(modelSelect).toHaveValue(modelLabel);
}

async function setTargetInputs(page: Page) {
  for (const [label, value] of Object.entries(TARGET_INPUTS)) {
    const input = page.getByLabel(`Input 1 ${label}`, { exact: true });
    await input.fill(value);
    await input.press("Enter");
  }
}

async function waitForTrace(plot: Locator, traceName: string) {
  await expect(plot).toHaveClass(/js-plotly-plot/);
  await expect.poll(() => plot.evaluate((element, expectedName) => {
    const traces = (element as HTMLElement & {
      data?: Array<{ name?: string }>;
    }).data ?? [];
    return traces.some(({ name }) => name === expectedName);
  }, traceName)).toBe(true);
}

async function waitForXAxisTitle(plot: Locator, titleFragment: string) {
  await expect.poll(() => plot.evaluate((element) => {
    const title = (element as HTMLElement & {
      _fullLayout?: { xaxis?: { title?: { text?: string } } };
    })._fullLayout?.xaxis?.title?.text;
    return title ?? "";
  })).toContain(titleFragment);
}

async function hoverPlotCoordinate(
  page: Page,
  plot: Locator,
  xValue: number,
  yValue: number,
) {
  const relativePoint = await plot.evaluate((element, values) => {
    const layout = (element as HTMLElement & {
      _fullLayout?: {
        xaxis?: { _offset: number; l2p: (value: number) => number };
        yaxis?: { _offset: number; l2p: (value: number) => number };
      };
    })._fullLayout;
    if (!layout?.xaxis || !layout.yaxis) {
      throw new Error("Plotly axes are not ready");
    }
    return {
      x: layout.xaxis._offset + layout.xaxis.l2p(values.xValue),
      y: layout.yaxis._offset + layout.yaxis.l2p(values.yValue),
    };
  }, { xValue, yValue });
  const plotBox = await plot.boundingBox();
  expect(plotBox).not.toBeNull();
  await page.mouse.move(
    plotBox!.x + relativePoint.x,
    plotBox!.y + relativePoint.y,
  );
}

async function openTargetPmvChart(
  page: Page,
  {
    model = "ashrae",
    display = "PMV",
    useIpUnits = false,
  }: TargetChartOptions = {},
) {
  await page.goto("/");
  await selectModel(page, model);

  const compareToggle = page.getByRole("checkbox", { name: "Enable input comparison" });
  const unitToggle = page.getByRole("checkbox", { name: "Use IP units" });
  await compareToggle.setChecked(false);
  await unitToggle.setChecked(false);
  await setTargetInputs(page);

  await selectDropdownOption(page, "Select chart type and export", "Dynamic");
  await selectDropdownOption(page, "Select chart X axis", "Air temperature");
  await selectDropdownOption(page, "Select chart Y axis", "Relative humidity");

  if (display === "PPD (%)") {
    await selectDropdownOption(page, "Select chart display output", display);
  }
  if (useIpUnits) {
    await unitToggle.setChecked(true, { force: true });
  }

  const plot = page.getByTestId("comfort-chart-plot");
  await waitForTrace(plot, `${display} bands hover`);
  await waitForXAxisTitle(plot, useIpUnits ? "°F" : "°C");

  return {
    plot,
    visual: page.getByTestId("comfort-chart-visual"),
  };
}

async function expectTargetResults(page: Page) {
  await expect(page.getByTitle("-0.19")).toBeVisible();
  await expect(page.getByTitle("5.7%")).toBeVisible();
  await expect(page.getByTitle("94.3%")).toBeVisible();
}

async function expectPmvConstraintFills(plot: Locator) {
  const fillTraces = await plot.evaluate((element) => {
    const traces = (element as HTMLElement & {
      data?: Array<{
        contours?: {
          coloring?: string;
          operation?: string;
          type?: string;
          value?: number | number[];
        };
        fillcolor?: string;
      }>;
    }).data ?? [];
    return traces
      .filter(({ contours }) => (
        contours?.type === "constraint" && contours.operation !== "="
      ))
      .map(({ contours, fillcolor }) => ({
        coloring: contours?.coloring,
        fillcolor,
        operation: contours?.operation,
        value: contours?.value,
      }));
  });

  expect(fillTraces).toEqual(PMV_COLORS.map((fillcolor, index) => ({
    ...PMV_FILL_CONSTRAINTS[index],
    coloring: "none",
    fillcolor,
  })));
  await expect(plot.locator(".contourbg path")).toHaveCount(0);
}

test.describe("PMV visual regression", () => {
  test("ASHRAE PMV in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page);

    await expectTargetResults(page);
    await expectPmvConstraintFills(plot);
    await expect(visual).toContainText("PMV Zones");
    await expect(visual).toContainText("Slightly Cool");
    await expect(visual).toContainText("Slightly Warm");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-si.png");
  });

  test("ASHRAE PMV input hover in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page);
    const inputPoint = plot.locator(".scatterlayer path.point");
    await expect(inputPoint).toHaveCount(1);

    const inputPointBox = await inputPoint.boundingBox();
    expect(inputPointBox).not.toBeNull();
    await page.mouse.move(
      inputPointBox!.x + inputPointBox!.width / 2,
      inputPointBox!.y + inputPointBox!.height / 2,
    );
    const hoverLayer = plot.locator(".hoverlayer");
    await expect(hoverLayer).toContainText("Air temperature: 26.0 °C");
    await expect(hoverLayer).toContainText("Relative humidity: 50.00 %");
    await expect(hoverLayer).toContainText("Zone: Neutral");
    await expect(hoverLayer).toContainText("PMV: -0.19");
    await expect(hoverLayer).toContainText("PPD: 5.7%");
    await expect(visual).toHaveScreenshot("pmv-ashrae-si-hover.png");

    await hoverPlotCoordinate(page, plot, 28, 50);
    await expect(hoverLayer).toContainText(/Air temperature: \d+\.\d °C/);
    await expect(hoverLayer).toContainText(/Relative humidity: \d+\.\d{2} %/);
    await expect(hoverLayer).toContainText(/Zone: \S+/);
    await expect(hoverLayer).toContainText(/PMV: -?\d+\.\d{2}/);
    await expect(hoverLayer).toContainText(/PPD: \d+\.\d%/);
  });

  test("ASHRAE PPD in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, { display: "PPD (%)" });

    await expect(visual).toContainText("PPD Bands");
    const constraintValues = await plot.evaluate((element) => {
      const traces = (element as HTMLElement & {
        data?: Array<{ contours?: { operation?: string; value?: number } }>;
      }).data ?? [];
      return traces
        .filter(({ contours }) => contours?.operation === "=")
        .map(({ contours }) => contours?.value);
    });
    expect(constraintValues).toEqual([10]);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("ppd-ashrae-si.png");
  });

  test("ISO PMV in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, { model: "iso" });

    await expectPmvConstraintFills(plot);
    await expect(visual).toContainText("PMV Zones");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-iso-si.png");
  });

  test("ASHRAE PMV in IP", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, { useIpUnits: true });

    await expectPmvConstraintFills(plot);
    await expect(visual).toContainText("PMV Zones");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-ip.png");
  });

  test("ASHRAE PMV with a non-equidistant transparent gap", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page);

    await page.getByRole("button", { name: "Edit chart thresholds" }).click();
    const secondLowerBound = page.getByLabel("Band 2 lower bound");
    await secondLowerBound.fill("-2.25");
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    await expect.poll(() => plot.evaluate((element) => {
      const traces = (element as HTMLElement & {
        data?: Array<{ contours?: { operation?: string; value?: number } }>;
      }).data ?? [];
      return traces.some(({ contours }) => (
        contours?.operation === "=" && contours.value === -2.25
      ));
    })).toBe(true);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-si-gap.png");
  });

  test("exports valid PNG and SVG files", async ({ page }) => {
    await openTargetPmvChart(page);

    await page.getByRole("button", { name: "Select chart type and export" }).click();
    const pngDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export as image (PNG)" }).click();
    const pngDownload = await pngDownloadPromise;
    const pngPath = await pngDownload.path();
    expect(pngDownload.suggestedFilename()).toBe(
      "pmv-ashrae-55-dynamic-chart-pmv.png",
    );
    expect(pngPath).not.toBeNull();
    const pngBytes = await readFile(pngPath!);
    expect((await stat(pngPath!)).size).toBeGreaterThan(1_000);
    expect([...pngBytes.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    await page.getByRole("button", { name: "Select chart type and export" }).click();
    const svgDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export as vector (SVG)" }).click();
    const svgDownload = await svgDownloadPromise;
    const svgPath = await svgDownload.path();
    expect(svgDownload.suggestedFilename()).toBe(
      "pmv-ashrae-55-dynamic-chart-pmv.svg",
    );
    expect(svgPath).not.toBeNull();
    const svgText = await readFile(svgPath!, "utf8");
    expect((await stat(svgPath!)).size).toBeGreaterThan(1_000);
    expect(svgText).toContain("<svg");
    expect(svgText).toContain("fill: rgb(5, 113, 176)");
    expect(svgText).toContain("fill: rgb(204, 121, 167)");
  });
});
