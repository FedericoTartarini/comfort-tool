import libraryPackage from "jsthermalcomfort/package.json";
import { describe, expect, it } from "vitest";
import appPackage from "../../package.json";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { copy } from "$lib/text/copy";
import type { ChartSpec } from "./charts/chartSpec";
import { chartType } from "./chartType";
import { defaultImageTitle, imageDescription, imageFileName, imageFooter, imageFormat, imageSize } from "./image";

const chart: ChartSpec = {
  traces: [],
  layout: { x: { title: "x", range: [0, 1] }, y: { title: "y", range: [0, 1] } },
  legend: [{ label: "Comfort zone", swatch: "fill", color: "#000000" }],
  annotations: [],
};

describe("imageSize", () => {
  it("is a single column 90 mm wide and a double column 190 mm wide", () => {
    expect(imageSize.singleColumn.widthMm).toBe(90);
    expect(imageSize.doubleColumn.widthMm).toBe(190);
  });
});

describe("defaultImageTitle", () => {
  it("is the model's name as the model select shows it and the chart type's title, for every registered model and each chart it declares", () => {
    for (const model of registeredModels) {
      for (const declared of model.charts) {
        expect(defaultImageTitle(model, declared.type)).toBe(`${model.info.label} · ${declared.type.title}`);
      }
    }
  });
});

describe("imageDescription", () => {
  it("holds the chart's description by identity and the size it was given", () => {
    for (const size of Object.values(imageSize)) {
      const image = imageDescription({ chart, size, title: "", summaryAndFooter: null });
      expect(image.chart).toBe(chart);
      expect(image.size).toBe(size);
    }
  });

  it("holds the title it was given", () => {
    const image = imageDescription({ chart, size: imageSize.doubleColumn, title: "Office in summer", summaryAndFooter: null });
    expect(image.title).toBe("Office in summer");
  });

  it("holds both the Input summary and the footer it was given, and with them left out neither", () => {
    const summary = [["PMV / PPD (ISO 7730) · ISO 7730:2005"], ["Metabolic rate (met): 1.2"]];
    const footer = imageFooter(new Date(2026, 9, 7));
    const included = imageDescription({ chart, size: imageSize.doubleColumn, title: "", summaryAndFooter: { summary, footer } });
    expect(included.summaryAndFooter?.summary).toBe(summary);
    expect(included.summaryAndFooter?.footer).toBe(footer);
    expect(imageDescription({ chart, size: imageSize.doubleColumn, title: "", summaryAndFooter: null }).summaryAndFooter).toBeNull();
  });

  it("holds no title for an empty title or one of spaces alone", () => {
    expect(imageDescription({ chart, size: imageSize.doubleColumn, title: "", summaryAndFooter: null }).title).toBeNull();
    expect(imageDescription({ chart, size: imageSize.doubleColumn, title: "   ", summaryAndFooter: null }).title).toBeNull();
  });
});

describe("imageFooter", () => {
  it("names the tool and its version, then the library, its version and the day, in that order", () => {
    expect(imageFooter(new Date(2026, 9, 7, 12))).toEqual([
      `${copy.appTitle} ${appPackage.version}`,
      `jsthermalcomfort ${libraryPackage.version} · 2026-10-07`,
    ]);
  });

  it("writes the day in the machine's time zone, from its first minute to its last", () => {
    expect(imageFooter(new Date(2026, 9, 7, 0, 30))[1]).toMatch(/ · 2026-10-07$/);
    expect(imageFooter(new Date(2026, 9, 7, 23, 30))[1]).toMatch(/ · 2026-10-07$/);
  });

  it("writes a month and a day of one digit with two", () => {
    expect(imageFooter(new Date(2027, 0, 5, 12))[1]).toMatch(/ · 2027-01-05$/);
  });
});

describe("imageFileName", () => {
  it("names a file with no title thermal-comfort-chart, then the size, then the format's extension", () => {
    expect(imageFileName("", imageSize.singleColumn, imageFormat.png)).toBe("thermal-comfort-chart-single-column.png");
    expect(imageFileName("", imageSize.singleColumn, imageFormat.svg)).toBe("thermal-comfort-chart-single-column.svg");
    expect(imageFileName("", imageSize.doubleColumn, imageFormat.png)).toBe("thermal-comfort-chart-double-column.png");
    expect(imageFileName("", imageSize.doubleColumn, imageFormat.svg)).toBe("thermal-comfort-chart-double-column.svg");
  });

  it("writes the default title in lower case, each run of other characters one hyphen", () => {
    expect(imageFileName("PMV (ASHRAE 55) · Psychrometric", imageSize.singleColumn, imageFormat.svg)).toBe(
      "pmv-ashrae-55-psychrometric-single-column.svg",
    );
  });

  it("names a file from a registered model's default title, at each size and format", () => {
    const title = defaultImageTitle(pmvPpdAshrae, chartType.psychrometric);
    expect(imageFileName(title, imageSize.singleColumn, imageFormat.png)).toBe("pmv-ppd-ashrae-55-psychrometric-single-column.png");
    expect(imageFileName(title, imageSize.singleColumn, imageFormat.svg)).toBe("pmv-ppd-ashrae-55-psychrometric-single-column.svg");
    expect(imageFileName(title, imageSize.doubleColumn, imageFormat.png)).toBe("pmv-ppd-ashrae-55-psychrometric-double-column.png");
    expect(imageFileName(title, imageSize.doubleColumn, imageFormat.svg)).toBe("pmv-ppd-ashrae-55-psychrometric-double-column.svg");
  });

  it("leaves no leading, trailing or doubled hyphen in a title of punctuation and capitals", () => {
    expect(imageFileName("  --Office: SUMMER/Winter!!  ", imageSize.doubleColumn, imageFormat.png)).toBe(
      "office-summer-winter-double-column.png",
    );
  });

  it("falls back to thermal-comfort-chart for a title with nothing in a-z or 0-9", () => {
    expect(imageFileName("温度 · ¿?", imageSize.singleColumn, imageFormat.png)).toBe(
      "thermal-comfort-chart-single-column.png",
    );
  });
});
