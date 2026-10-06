import { describe, expect, it } from "vitest";
import type { ChartSpec } from "./charts/chartSpec";
import { imageDescription, imageFileName, imageFormat, imageSize } from "./image";

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

describe("imageDescription", () => {
  it("holds the chart's description by identity and the size it was given", () => {
    for (const size of Object.values(imageSize)) {
      const image = imageDescription({ chart, size });
      expect(image.chart).toBe(chart);
      expect(image.size).toBe(size);
    }
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
