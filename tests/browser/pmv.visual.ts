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

const COMPLIANCE_COLORS = [
  resolveZoneAppearance(ZoneToken.FailFill).fill,
  resolveZoneAppearance(ZoneToken.Acceptable).fill,
  resolveZoneAppearance(ZoneToken.FailFill).fill,
];

const PLOT_BACKGROUND = "#f8fafc";
const BAND_OPACITY = 0.8;

function blendHexOntoPlot(foreground: string, background: string, opacity: number): string {
  const channel = (hex: string, shift: number) => (
    (Number.parseInt(hex.slice(1), 16) >> shift) & 255
  );
  const mix = (fg: number, bg: number) => Math.round(fg * opacity + bg * (1 - opacity));
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(channel(foreground, 16), channel(background, 16)))}${
    toHex(mix(channel(foreground, 8), channel(background, 8)))
  }${toHex(mix(channel(foreground, 0), channel(background, 0)))}`;
}

// Dynamic charts use a transparent Plotly plot_bg, so bakeOpaquePolygonFill
// cannot blend fills. Screen traces keep the ZoneToken hex; publication export
// still bakes against a solid background.
const PMV_FILLCOLORS = PMV_COLORS;
const COMPLIANCE_FILLCOLORS = COMPLIANCE_COLORS;

const PSYCHROMETRIC_COMPLIANCE_FILLCOLORS = COMPLIANCE_COLORS.map((fill) => (
  blendHexOntoPlot(fill, PLOT_BACKGROUND, BAND_OPACITY)
));

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


const MODEL_LABELS = {
  ashrae: "PMV/PPD (ASHRAE 55)",
  iso: "PMV/PPD (ISO 7730)",
} as const;

type PmvModel = keyof typeof MODEL_LABELS;
type PmvDisplay = "PMV" | "PPD (%)";

interface TargetChartOptions {
  model?: PmvModel;
  display?: PmvDisplay;
  surface?: "standard" | "explore";
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

async function waitForBandFills(plot: Locator, namePrefix: string) {
  await expect(plot).toHaveClass(/js-plotly-plot/);
  await expect
    .poll(() =>
      plot.evaluate((element, prefix) => {
        const traces =
          (
            element as HTMLElement & {
              data?: Array<{ name?: string; fill?: string }>;
            }
          ).data ?? [];
        return traces.some(({ name, fill }) => (
          fill === "toself"
          && typeof name === "string"
          && name.startsWith(prefix)
        ));
      }, namePrefix),
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

async function waitForXAxisDtick(plot: Locator, dtick: number) {
  await expect
    .poll(() =>
      plot.evaluate((element) => {
        const axis = (
          element as HTMLElement & {
            _fullLayout?: { xaxis?: { dtick?: number; tickmode?: string } };
          }
        )._fullLayout?.xaxis;
        return `${axis?.tickmode ?? ""}:${axis?.dtick ?? ""}`;
      }),
    )
    .toBe(`linear:${dtick}`);
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

async function openTargetPmvChart(
  page: Page,
  {
    model = "ashrae",
    display = "PMV",
    surface = "explore",
    useIpUnits = false,
  }: TargetChartOptions = {},
) {
  const pathname =
    surface === "explore"
      ? "/Explore/"
      : model === "iso"
        ? "/standard/iso-7730/"
        : "/standard/ashrae-55/";
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
    panel.getByText(surface === "explore" ? "Explore" : "Compliance", {
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
  await waitForBandFills(plot, `${display} bands:`);
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

async function readBandFillcolors(plot: Locator, prefix: string): Promise<string[]> {
  return plot.evaluate((element, namePrefix) => {
    const traces =
      (
        element as HTMLElement & {
          data?: Array<{ name?: string; fill?: string; fillcolor?: string }>;
        }
      ).data ?? [];
    return traces
      .filter(({ name, fill }) => (
        fill === "toself"
        && typeof name === "string"
        && name.startsWith(namePrefix)
      ))
      .map(({ fillcolor }) => fillcolor ?? "");
  }, prefix);
}

async function expectPmvBandFills(plot: Locator) {
  await expect.poll(() => readBandFillcolors(plot, "PMV bands:")).toEqual(PMV_FILLCOLORS);
}

async function expectComplianceBandFills(plot: Locator) {
  await expect.poll(() => readBandFillcolors(plot, "PMV bands:")).toEqual(COMPLIANCE_FILLCOLORS);
}

async function readPsychrometricBandFillcolors(plot: Locator): Promise<string[]> {
  return plot.evaluate((element) => {
    const traces =
      (
        element as HTMLElement & {
          data?: Array<{ name?: string; fill?: string; fillcolor?: string }>;
        }
      ).data ?? [];
    return traces
      .filter(({ name, fill }) => (
        fill === "toself"
        && typeof name === "string"
        && name.startsWith("PMV bands:")
      ))
      .map(({ fillcolor }) => fillcolor ?? "");
  });
}

async function expectPsychrometricComplianceBandFills(plot: Locator) {
  await expect
    .poll(() => readPsychrometricBandFillcolors(plot))
    .toEqual(PSYCHROMETRIC_COMPLIANCE_FILLCOLORS);
}

test.describe("PMV visual regression", () => {
  test("ASHRAE Standard workspace locks Compliance profile and exposes Explore controls", async ({
    page,
  }) => {
    const { panel, plot } = await openTargetPmvChart(page, {
      surface: "standard",
    });

    await expect(panel.getByRole("group", { name: "Chart mode" })).toBeHidden();
    await expect(panel.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(
      panel.getByText(
        "Green shading = ASHRAE 55 compliant PMV (−0.5 < PMV < +0.5); red = outside the limit.",
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
    await expectComplianceBandFills(plot);
    await page.mouse.move(0, 0);
    await expect(panel).toHaveScreenshot("pmv-ashrae-compliance-panel.png");

    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/pmv-ashrae\/$/);
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
    await expectComplianceBandFills(plot);
    await page.mouse.move(0, 0);
    await expect(panel).toHaveScreenshot("pmv-ashrae-explore-panel.png");
  });

  test("ASHRAE fixed psychrometric view keeps the active Explore output and bands", async ({
    page,
  }) => {
    const { panel, plot, visual } = await openTargetPmvChart(page, {
      display: "PPD (%)",
      surface: "explore",
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
    await waitForBandFills(plot, "PPD (%) bands:");
    await waitForXAxisDtick(plot, 2);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot(
      "pmv-ashrae-psychrometric-explore-si.png",
    );

    await page.getByRole("link", { name: "ASHRAE 55", exact: true }).click();
    await expect(page).toHaveURL(/\/standard\/ashrae-55\/pmv-ashrae\/$/);
    await expect(panel.getByText("Compliance", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select chart output" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Edit chart thresholds" }),
    ).toBeHidden();
    await waitForBandFills(plot, "PMV bands:");
    await expectPsychrometricComplianceBandFills(plot);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot(
      "pmv-ashrae-psychrometric-compliance-si.png",
    );

    await page.locator("#advanced-input-temperature").click();
    await page.getByRole("button", { name: /Operative temp/ }).click();
    await expect(
      page.getByLabel("Input 1 Operative temperature", { exact: true }),
    ).toBeVisible();
    await waitForXAxisTitle(plot, "Operative temperature");
    await waitForBandFills(plot, "PMV bands:");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot(
      "pmv-ashrae-psychrometric-operative-si.png",
    );
  });

  test("ASHRAE psychrometric hover follows the pointer", async ({
    page,
  }) => {
    const { plot } = await openTargetPmvChart(page, { surface: "standard" });
    const chartTrigger = page.getByRole("button", {
      name: "Select chart type and export",
    });
    await chartTrigger.click();
    await page
      .getByRole("button", { name: "Psychrometric", exact: true })
      .click();
    await expect(chartTrigger).toContainText("Psychrometric");
    await page.keyboard.press("Escape");
    await waitForBandFills(plot, "PMV bands:");
    await waitForXAxisDtick(plot, 2);

    const hoverLayer = plot.locator(".hoverlayer");
    const inputPoint = plot.locator(".scatterlayer path.point");
    await expect(inputPoint).toHaveCount(1);
    const inputPointBox = await inputPoint.boundingBox();
    expect(inputPointBox).not.toBeNull();
    await page.mouse.move(
      inputPointBox!.x + inputPointBox!.width / 2,
      inputPointBox!.y + inputPointBox!.height / 2,
    );
    await expect(hoverLayer).not.toContainText("Input 1");
    await expect(hoverLayer).toContainText(/Humidity ratio: \d+(\.\d+)? g\/kg/);
    await expect(hoverLayer).toContainText(/Zone:/);
    await expect(hoverLayer).toContainText(/PMV:/);
    await expect(hoverLayer).toContainText(/PPD:/);

    // 22 °C / 7.5 g/kg sits between the 40% and 50% RH curves.
    await hoverPlotCoordinate(page, plot, 22, 7.5);
    await expect(hoverLayer).not.toContainText("Input 1");
    await expect(hoverLayer).toContainText(/Air temperature:/);
    await expect(hoverLayer).toContainText(/Humidity ratio:/);
    await expect(hoverLayer).toContainText(/Zone:/);
    await expect(hoverLayer).toContainText(/PMV:/);
    await expect(hoverLayer).toContainText(/PPD:/);
  });

  test("ASHRAE PMV in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page);

    await expectTargetResults(page);
    await expectComplianceBandFills(plot);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-si.png");
  });

  test("ASHRAE To×vr without local control clips elevated air speed", async ({
    page,
  }) => {
    const { plot, visual } = await openTargetPmvChart(page);
    await page.locator("#advanced-input-airSpeed").click();
    await page.getByRole("button", { name: /No local control/ }).click();
    await selectDropdownOption(page, "Select chart X axis", "Operative temperature");
    await selectDropdownOption(page, "Select chart Y axis", "Air speed");
    await waitForBandFills(plot, "PMV bands:");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-veltop-no-control-si.png");
  });

  test("ASHRAE To×vr with local control keeps the unclipped envelope", async ({
    page,
  }) => {
    const { plot, visual } = await openTargetPmvChart(page);
    await selectDropdownOption(page, "Select chart X axis", "Operative temperature");
    await selectDropdownOption(page, "Select chart Y axis", "Air speed");
    await waitForBandFills(plot, "PMV bands:");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-ashrae-veltop-local-control-si.png");
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
    await expect(hoverLayer).not.toContainText("Input 1");
    await expect(hoverLayer).toContainText(/Air temperature: \d+(\.\d+)? °C/);
    await expect(hoverLayer).toContainText(/Relative humidity: \d+(\.\d+)? %/);
    await expect(hoverLayer).toContainText("Zone: acceptable");
    await expect(hoverLayer).toContainText(/PMV: -0\.\d+/);
    await expect(hoverLayer).toContainText(/PPD: \d+(\.\d+)?%/);
    await expect(visual).toHaveScreenshot("pmv-ashrae-si-hover.png");

    await hoverPlotCoordinate(page, plot, 28, 50);
    await expect(hoverLayer).not.toContainText("Input 1");
    await expect(hoverLayer).toContainText(/Air temperature:/);
    await expect(hoverLayer).toContainText(/Relative humidity:/);
    await expect(hoverLayer).toContainText(/Zone:/);
    await expect(hoverLayer).toContainText(/PMV:/);
    await expect(hoverLayer).toContainText(/PPD:/);
  });

  test("ASHRAE PPD in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, {
      display: "PPD (%)",
    });

    await waitForBandFills(plot, "PPD (%) bands:");
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("ppd-ashrae-si.png");
  });

  test("ISO PMV in SI", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, { model: "iso" });

    await expectPmvBandFills(plot);
    await page.mouse.move(0, 0);
    await expect(visual).toHaveScreenshot("pmv-iso-si.png");
  });

  test("ASHRAE PMV in IP", async ({ page }) => {
    const { plot, visual } = await openTargetPmvChart(page, {
      useIpUnits: true,
    });

    await expectComplianceBandFills(plot);
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

    await waitForBandFills(plot, "PMV bands:");

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
      "pmv-ppd-ashrae-55-dynamic-pmv-single.png",
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
      "pmv-ppd-ashrae-55-dynamic-pmv-double.svg",
    );
    expect(svgPath).not.toBeNull();
    const svgText = await readFile(svgPath!, "utf8");
    expect((await stat(svgPath!)).size).toBeGreaterThan(1_000);
    expect(svgText).toContain("<svg");
    expect(svgText).toContain(`fill: ${publicationFillCss(ZoneToken.Acceptable)}`);
    expect(svgText).toContain(`fill: ${publicationFillCss(ZoneToken.FailFill)}`);
  });
});
