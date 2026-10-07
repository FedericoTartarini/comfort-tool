import { describe, expect, it } from "vitest";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import type { ChartSpec } from "./charts/chartSpec";
import { chartType } from "./chartType";
import { defaultImageTitle, imageDescription, imageFileName, imageFormat, imageSize } from "./image";

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
      const image = imageDescription({ chart, size, title: "" });
      expect(image.chart).toBe(chart);
      expect(image.size).toBe(size);
    }
  });

  it("holds the title it was given", () => {
    const image = imageDescription({ chart, size: imageSize.doubleColumn, title: "Office in summer" });
    expect(image.title).toBe("Office in summer");
  });

  it("holds no title for an empty title or one of spaces alone", () => {
    expect(imageDescription({ chart, size: imageSize.doubleColumn, title: "" }).title).toBeNull();
    expect(imageDescription({ chart, size: imageSize.doubleColumn, title: "   " }).title).toBeNull();
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
