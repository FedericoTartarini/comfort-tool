import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";

import {
  resolveZoneAppearance,
  ZonePaletteKind,
  ZoneToken,
} from "../../src/catalog/zoneTokens";

const TARGET_INPUTS = {
  "Air temperature": "26",
  "Radiant temperature": "25",
  "Relative air speed": "0.10",
  "Relative humidity": "50",
  "Metabolic rate": "1.0",
  "Clothing insulation": "0.51",
} as const;

const PMV_COLORS = [
  ZoneToken.Cold,
  ZoneToken.Cool,
  ZoneToken.SlightlyCool,
  ZoneToken.Neutral,
  ZoneToken.SlightlyWarm,
  ZoneToken.Warm,
  ZoneToken.Hot,
].map((token) => resolveZoneAppearance(token).fill);

const PMV_FILL_CONSTRAINTS = [
  { operation: ">=", value: -2.5 },
  { operation: "][", value: [-2.5, -1.5] },
  { operation: "][", value: [-1.5, -0.5] },
  { operation: "][", value: [-0.5, 0.5] },
  { operation: "][", value: [0.5, 1.5] },
  { operation: "][", value: [1.5, 2.5] },
  { operation: "<", value: 2.5 },
] as const;

const COMPLIANCE_COLORS = [
  resolveZoneAppearance(ZoneToken.FailFill).fill,
  resolveZoneAppearance(ZoneToken.Acceptable).fill,
  resolveZoneAppearance(ZoneToken.FailFill).fill,
];

function hexToCssRgb(hex: string): string {
  const normalized = hex.trim().replace(/^#/, "");
  const value = Number.parseInt(normalized, 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

function publicationFillCss(token: ZoneToken): string {
  return hexToCssRgb(
    resolveZoneAppearance(token, ZonePaletteKind.Publication).fill,
  );
}

const COMPLIANCE_FILL_CONSTRAINTS = [
  { operation: ">=", value: -0.5 },
  { operation: "][", value: [-0.5, 0.5] },
  { operation: "<", value: 0.5 },
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
  workspace?: "standard" | "explore";
  useIpUnits?: boolean;
}

async function selectDropdownOption(
  page: Page,
  triggerName: string,
  optionName: string,
) {
  const trigger = page.getByRole("button", { name: triggerName });
  if ((await trigger.textContent())?.includes(optionName)) {
    return;
  }
  await trigger.click();
  const option = page.getByRole("button", { name: optionName, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(trigger).toContainText(optionName);
  await page.mouse.click(1, 1);
  await expect(option).toBeHidden();
}

async function selectModel(page: Page, model: PmvModel) {
  const modelSelect = page.getByRole("combobox", {
    name: "Select comfort model",
  });
  const modelLabel = MODEL_LABELS[model];
  if ((await modelSelect.inputValue()) === modelLabel) {
    return;
  }
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
  await expect
    .poll(() =>
      plot.evaluate((element, expectedName) => {
        const traces =
          (
            element as HTMLElement & {
              data?: Array<{ name?: string }>;
            }
          ).data ?? [];
        return traces.some(({ name }) => name === expectedName);
      }, traceName),
    )
    .toBe(true);
}

async function waitForXAxisTitle(plot: Locator, titleFragment: string) {
  await expect
    .poll(() =>
      plot.evaluate((element) => {
        const title = (
          element as HTMLElement & {
            _fullLayout?: { xaxis?: { title?: { text?: string } } };
          }
        )._fullLayout?.xaxis?.title?.text;
        return title ?? "";
      }),
    )
    .toContain(titleFragment);
}

async function hoverPlotCoordinate(
  page: Page,
  plot: Locator,
  xValue: number,
  yValue: number,
) {
  const relativePoint = await plot.evaluate(
    (element, values) => {
      const layout = (
        element as HTMLElement & {
          _fullLayout?: {
            xaxis?: { _offset: number; l2p: (value: number) => number };
            yaxis?: { _offset: number; l2p: (value: number) => number };
          };
        }
      )._fullLayout;
      if (!layout?.xaxis || !layout.yaxis) {
        throw new Error("Plotly axes are not ready");
      }
      return {
        x: layout.xaxis._offset + layout.xaxis.l2p(values.xValue),
        y: layout.yaxis._offset + layout.yaxis.l2p(values.yValue),
      };
    },
    { xValue, yValue },
  );
  const plotBox = await plot.boundingBox();
  expect(plotBox).not.toBeNull();
  await page.mouse.move(
    plotBox!.x + relativePoint.x,
    plotBox!.y + relativePoint.y,
  );
}

async function findGridXForOutput(
  plot: Locator,
  outputValue: number,
  yValue: number,
): Promise<number> {
  return plot.evaluate(
    (element, target) => {
      const traces =
        (
          element as HTMLElement & {
            data?: Array<{
              contours?: { operation?: string; type?: string };
              x?: number[];
              y?: number[];
              z?: number[][];
            }>;
          }
        ).data ?? [];
      const trace = traces.find(
        ({ contours, z }) =>
          contours?.type === "constraint" && contours.operation !== "=" && z,
      );
      if (!trace?.x || !trace.y || !trace.z) {
        throw new Error("Constraint grid is not ready");
      }

      const upperYIndex = trace.y.findIndex((value) => value >= target.yValue);
      const lowerYIndex = Math.max(0, upperYIndex - 1);
      if (upperYIndex < 0) {
        throw new Error(
          `Y value ${target.yValue} is outside the constraint grid`,
        );
      }
      const ySpan = trace.y[upperYIndex] - trace.y[lowerYIndex];
      const yFraction =
        ySpan === 0 ? 0 : (target.yValue - trace.y[lowerYIndex]) / ySpan;
      const outputAtY = trace.x.map(
        (_, xIndex) =>
          trace.z![lowerYIndex][xIndex] +
          (trace.z![upperYIndex][xIndex] - trace.z![lowerYIndex][xIndex]) *
            yFraction,
      );

      for (
        let upperXIndex = 1;
        upperXIndex < outputAtY.length;
        upperXIndex += 1
      ) {
        const lowerValue = outputAtY[upperXIndex - 1];
        const upperValue = outputAtY[upperXIndex];
        if (
          Number.isFinite(lowerValue) &&
          Number.isFinite(upperValue) &&
          (lowerValue - target.outputValue) *
            (upperValue - target.outputValue) <=
            0
        ) {
          const fraction =
            upperValue === lowerValue
              ? 0
              : (target.outputValue - lowerValue) / (upperValue - lowerValue);
          return (
            trace.x[upperXIndex - 1] +
            (trace.x[upperXIndex] - trace.x[upperXIndex - 1]) * fraction
          );
        }
      }

      throw new Error(
        `Output ${target.outputValue} is outside the constraint grid`,
      );
    },
    { outputValue, yValue },
  );
}

async function openTargetPmvChart(
  page: Page,
  {
    model = "ashrae",
    display = "PMV",
    workspace = "explore",
    useIpUnits = false,
  }: TargetChartOptions = {},
) {
  const pathname =
    workspace === "explore"
      ? "/Explore/"
      : model === "iso"
        ? "/ISO-7730/"
        : "/ASHRAE-55/";
  await page.goto(pathname);
  await selectModel(page, model);

  const compareToggle = page.getByRole("checkbox", {
    name: "Enable input comparison",
  });
  const unitToggle = page.getByRole("checkbox", { name: "Use IP units" });
  await compareToggle.setChecked(false);
  await unitToggle.setChecked(false);
  await setTargetInputs(page);

  const chartTrigger = page.getByRole("button", {
    name: "Select chart type and export",
  });
  await selectDropdownOption(page, "Select chart type and export", "Dynamic");
  await expect(chartTrigger).toContainText("Dynamic");

  const panel = page.getByTestId("comfort-chart-panel");
  await expect(panel.getByRole("group", { name: "Chart mode" })).toBeHidden();
  await expect(
    panel.getByText(workspace === "explore" ? "Explore" : "Compliance", {
      exact: true,
    }),
  ).toBeVisible();

  await selectDropdownOption(page, "Select chart X axis", "Air temperature");
  await selectDropdownOption(page, "Select chart Y axis", "Relative humidity");

  if (display === "PPD (%)") {
    await selectDropdownOption(page, "Select chart output", display);
  }
  if (useIpUnits) {
    await unitToggle.setChecked(true, { force: true });
  }

  const plot = page.getByTestId("comfort-chart-plot");
  await waitForTrace(plot, `${display} bands hover`);
  await waitForXAxisTitle(plot, useIpUnits ? "°F" : "°C");

  return {
    panel,
    plot,
    visual: page.getByTestId("comfort-chart-visual"),
  };
}

async function expectTargetResults(page: Page) {
  await expect(page.getByTitle("-0.19")).toBeVisible();
  await expect(page.getByTitle("5.7%")).toBeVisible();
  await expect(page.getByTitle("94.3%")).toBeVisible();
}

async function readConstraintFills(plot: Locator) {
  return plot.evaluate((element) => {
    const traces =
      (
        element as HTMLElement & {
          data?: Array<{
            contours?: {
              coloring?: string;
              operation?: string;
              type?: string;
              value?: number | number[];
            };
            fillcolor?: string;
          }>;
        }
      ).data ?? [];
    return traces
      .filter(
        ({ contours }) =>
          contours?.type === "constraint" && contours.operation !== "=",
      )
      .map(({ contours, fillcolor }) => ({
        coloring: contours?.coloring,
        fillcolor,
        operation: contours?.operation,
        value: contours?.value,
      }));
  });
}

async function expectPmvConstraintFills(plot: Locator) {
  await expect
    .poll(() => readConstraintFills(plot))
    .toEqual(
      PMV_COLORS.map((fillcolor, index) => ({
        ...PMV_FILL_CONSTRAINTS[index],
        coloring: "none",
        fillcolor,
      })),
    );
  await expect(plot.locator(".contourbg path")).toHaveCount(0);
}

async function expectComplianceConstraintFills(plot: Locator) {
  await expect
    .poll(() => readConstraintFills(plot))
    .toEqual(
      COMPLIANCE_COLORS.map((fillcolor, index) => ({
        ...COMPLIANCE_FILL_CONSTRAINTS[index],
        coloring: "none",
        fillcolor,
      })),
    );
  await expect(plot.locator(".contourbg path")).toHaveCount(0);
}

test.describe("PMV visual regression", () => {
  test("ASHRAE Standard workspace locks Compliance profile and exposes Explore controls", async ({
    page,
  }) => {
    const { panel, plot } = await openTargetPmvChart(page, {
      workspace: "standard",
    });

    await expect(panel.getByRole("group", { name: "Chart mode" })).toBeHidden();
    await expect(panel.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(
      panel.getByText(
        "Green shading = ASHRAE 55 compliant PMV (−0.5 ≤ PMV < +0.5); red = outside the limit.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(panel.getByLabel("Your input: Compliant")).toBeVisible();
    await expect(panel.getByText("Compliant", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select chart X axis" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select chart Y axis" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select chart output" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Edit chart thresholds" }),
    ).toBeHidden();
    await expectComplianceConstraintFills(plot);
    await page.mouse.move(0, 0);
    await expect(panel).toHaveScreenshot("pmv-ashrae-compliance-panel.png");

    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/Explore\/$/);
    await expect(panel.getByText("Explore", { exact: true })).toBeVisible();
    await expect(
      panel.getByText(
        "Showing PMV over the selected axes with editable thresholds.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(panel.getByText("Compliant", { exact: true })).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Select chart output" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit chart thresholds" }),
    ).toBeVisible();
    await expectPmvConstraintFills(plot);
    await page.mouse.move(0, 0);
    await expect(panel).toHaveScreenshot("pmv-ashrae-explore-panel.png");
  });

  test("ASHRAE fixed psychrometric view keeps the active Explore output and bands", async ({
    page,
  }) => {
    const { panel, plot, visual } = await openTargetPmvChart(page, {
      display: "PPD (%)",
      workspace: "explore",
    });
    const chartTrigger = page.getByRole("button", {
      name: "Select chart type and export",
    });
    await chartTrigger.click();
    await page
      .getByRole("button", { name: "Psychrometric", exact: true })
      .click();
    await expect(chartTrigger).toContainText("Psychrometric");

    await expect(panel.getByRole("group", { name: "Chart mode" })).toBeHidden();
    await expect(panel.getByText("Explore", { exact: true })).toBeVisible();
    await expect(
      panel.getByText(
        "Showing PPD (%) on this chart's fixed axes with editable thresholds.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select chart X axis" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Select chart Y axis" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Select chart output" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit chart thresholds" }),
    ).toBeVisible();
    await waitForTrace(plot, "PPD (%) bands hover");

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await expect(page).toHaveURL(/\/ASHRAE-55\/$/);
    await expect(panel.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select chart output" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Edit chart thresholds" }),
    ).toBeHidden();
    await waitForTrace(plot, "PMV bands hover");
    await expectComplianceConstraintFills(plot);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot(
      "pmv-ashrae-psychrometric-compliance-si.png",
    );
  });

  test("ASHRAE PMV in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page);

    await expectTargetResults(page);
    await expectPmvConstraintFills(plot);
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
    await expect(hoverLayer).toContainText(/Relative humidity: \d+ %/);
    await expect(hoverLayer).toContainText("Zone: Neutral");
    await expect(hoverLayer).toContainText(/PMV: 0\.\d{2}/);
    await expect(hoverLayer).toContainText(/PPD: \d+\.\d%/);
  });

  test("ASHRAE PPD in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, {
      display: "PPD (%)",
    });

    const constraintValues = await plot.evaluate((element) => {
      const traces =
        (
          element as HTMLElement & {
            data?: Array<{ contours?: { operation?: string; value?: number } }>;
          }
        ).data ?? [];
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
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-iso-si.png");
  });

  test("ASHRAE PMV in IP", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, {
      useIpUnits: true,
    });

    await expectPmvConstraintFills(plot);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-ip.png");
  });

  test("ASHRAE PMV with a non-equidistant transparent gap", async ({
    page,
  }) => {
    const { plot, visual } = await openTargetPmvChart(page);

    await page.getByRole("button", { name: "Edit chart thresholds" }).click();
    const secondLowerBound = page.getByLabel("Band 2 lower bound");
    await secondLowerBound.fill("-2.25");
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    await expect
      .poll(() =>
        plot.evaluate((element) => {
          const traces =
            (
              element as HTMLElement & {
                data?: Array<{
                  contours?: { operation?: string; value?: number };
                }>;
              }
            ).data ?? [];
          return traces.some(
            ({ contours }) =>
              contours?.operation === "=" && contours.value === -2.25,
          );
        }),
      )
      .toBe(true);

    const hoverLayer = plot.locator(".hoverlayer");
    const gapX = await findGridXForOutput(plot, -2.375, 50);
    await hoverPlotCoordinate(page, plot, gapX, 50);
    await expect(hoverLayer).toContainText(/Air temperature: -?\d+\.\d °C/);
    await expect(hoverLayer).toContainText(/Relative humidity: \d+ %/);
    await expect(hoverLayer).toContainText("Zone: Unclassified");
    await expect(hoverLayer).toContainText(/PMV: -2\.\d{2}/);
    await expect(hoverLayer).toContainText(/PPD: \d+\.\d%/);

    const adjacentBandX = await findGridXForOutput(plot, -2.1, 50);
    await hoverPlotCoordinate(page, plot, adjacentBandX, 50);
    await expect(hoverLayer).toContainText(/Air temperature: -?\d+\.\d °C/);
    await expect(hoverLayer).toContainText(/Relative humidity: \d+ %/);
    await expect(hoverLayer).toContainText("Zone: Cool");
    await expect(hoverLayer).toContainText(/PMV: -2\.\d{2}/);
    await expect(hoverLayer).toContainText(/PPD: \d+\.\d%/);

    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-si-gap.png");
  });

  test("exports valid PNG and SVG files", async ({ page }) => {
    await openTargetPmvChart(page);

    await page
      .getByRole("button", { name: "Select chart type and export" })
      .click();
    const pngDownloadPromise = page.waitForEvent("download");
    await page
      .getByTestId("chart-toolbar")
      .getByRole("button", { name: "PNG, single column" })
      .click();
    const pngDownload = await pngDownloadPromise;
    const pngPath = await pngDownload.path();
    expect(pngDownload.suggestedFilename()).toBe(
      "pmv-ashrae-55-dynamic-chart-pmv-single.png",
    );
    expect(pngPath).not.toBeNull();
    const pngBytes = await readFile(pngPath!);
    expect((await stat(pngPath!)).size).toBeGreaterThan(1_000);
    expect([...pngBytes.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    await page
      .getByRole("button", { name: "Select chart type and export" })
      .click();
    const svgDownloadPromise = page.waitForEvent("download");
    await page
      .getByTestId("chart-toolbar")
      .getByRole("button", { name: "SVG, double column" })
      .click();
    const svgDownload = await svgDownloadPromise;
    const svgPath = await svgDownload.path();
    expect(svgDownload.suggestedFilename()).toBe(
      "pmv-ashrae-55-dynamic-chart-pmv-double.svg",
    );
    expect(svgPath).not.toBeNull();
    const svgText = await readFile(svgPath!, "utf8");
    expect((await stat(svgPath!)).size).toBeGreaterThan(1_000);
    expect(svgText).toContain("<svg");
    expect(svgText).toContain(`fill: ${publicationFillCss(ZoneToken.Cold)}`);
    expect(svgText).toContain(`fill: ${publicationFillCss(ZoneToken.Hot)}`);
  });
});
