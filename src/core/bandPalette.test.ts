import { describe, expect, it } from "vitest";
import { PMV_PPD_ISO_INFO, type ClassifierBins } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { colorForBand, fillAtIndex, sensationPalette } from "./bandPalette";
import { dynamicChartOf, isPolygonsChart } from "./modelDeclaration";

const tsvClassifier = PMV_PPD_ISO_INFO.outputs.tsv?.classifier;
if (!tsvClassifier) {
  throw new Error("PMV_PPD_ISO_INFO no longer classifies tsv");
}

describe("colorForBand", () => {
  it("colours by the category's position in the classifier's labels", () => {
    expect(colorForBand(tsvClassifier, "Cold")).toBe(sensationPalette[0]);
    expect(colorForBand(tsvClassifier, "Neutral")).toBe(sensationPalette[3]);
    expect(colorForBand(tsvClassifier, "Hot")).toBe(sensationPalette[6]);
  });

  it("returns nothing for a category the classifier does not name", () => {
    expect(colorForBand(tsvClassifier, Number.NaN)).toBeUndefined();
    expect(colorForBand(tsvClassifier, "Freezing")).toBeUndefined();
  });
});

describe("fillAtIndex", () => {
  // One label more than the palette has colours, as UTCI's ten-label
  // `stress_category` is against today's seven.
  const labels = [...sensationPalette.map((_, index) => `band ${index + 1}`), "one band too many"];
  const tooLong: ClassifierBins = { labels, edges: labels.map((_, index) => index), right: false };

  it("throws naming a classifier with more labels than the palette has colours, rather than wrapping round", () => {
    expect(() => fillAtIndex(tooLong, 0)).toThrow('"band 1" … "one band too many"');
    expect(() => colorForBand(tooLong, "one band too many")).toThrow('"band 1" … "one band too many"');
  });

  it("has a colour for every band of every classifier a registered model paints", () => {
    // The Compliance column paints each classified output; the scanned
    // dynamic chart paints its declared bands.
    for (const model of registeredModels) {
      const painted = Object.entries(model.info.outputs).flatMap(([key, variable]) =>
        variable.classifier ? [{ name: `${model.info.label} ${key}`, bins: variable.classifier }] : [],
      );
      const chart = dynamicChartOf(model);
      if (chart && !isPolygonsChart(chart)) {
        painted.push({ name: `${model.info.label} dynamic chart`, bins: chart.bands });
      }
      for (const { name, bins } of painted) {
        expect(bins.labels.length, name).toBeLessThanOrEqual(sensationPalette.length);
      }
    }
  });
});
