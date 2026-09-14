import { describe, expect, it } from "vitest";
import { PMV_PPD_ISO_INFO } from "jsthermalcomfort-main";
import { colorForBand, sensationPalette } from "./bandPalette";

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
