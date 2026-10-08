import { describe, expect, it } from "vitest";
import {
  HEAT_INDEX_STRESS_CATEGORY_BINS,
  PMV_CATEGORY_BINS_ISO,
  PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE,
  PMV_THERMAL_SENSATION_VOTE_BINS_ISO,
  UTCI_STRESS_CATEGORY_BINS,
  type ClassifierBins,
} from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { bandColors, chartInk, colorForBand, palettes, type PaletteEntry } from "./bandPalette";

// ColorBrewer's RdBu-7, read cold to hot: the thermal-sensation scale's Cold … Hot.
const rdBu7 = ["#2166ac", "#67a9cf", "#d1e5f0", "#f7f7f7", "#fddbc7", "#ef8a62", "#b2182b"];

const binsOfLength = (count: number): ClassifierBins => {
  const labels = Array.from({ length: count }, (_, index) => `band ${index + 1}`);
  return { labels, edges: labels.map((_, index) => index), right: true };
};

describe("bandColors", () => {
  it("gives the thermal-sensation bins of either standard RdBu-7, Neutral its grey at the fourth position", () => {
    expect(bandColors(PMV_THERMAL_SENSATION_VOTE_BINS_ISO)).toEqual(rdBu7);
    expect(bandColors(PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE)).toEqual(rdBu7);
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Neutral")).toBe("#f7f7f7");
  });

  it("gives Heat Index's five stress categories YlOrRd-6 without its lightest, so \"no risk\" is not near white", () => {
    expect(bandColors(HEAT_INDEX_STRESS_CATEGORY_BINS)).toEqual(["#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"]);
  });

  it("gives ISO 7730's four bands YlOrRd-5 without its lightest, \"none\" unpainted", () => {
    expect(bandColors(PMV_CATEGORY_BINS_ISO)).toEqual(["#fecc5c", "#fd8d3c", "#f03b20", undefined]);
  });

  it("gives UTCI's ten stress categories five blues, RdBu-11's grey at the sixth position and four reds", () => {
    // RdBu-11 centred on "no thermal stress": the warm side's surplus, the red next to the grey, dropped.
    expect(bandColors(UTCI_STRESS_CATEGORY_BINS)).toEqual([
      "#053061",
      "#2166ac",
      "#4393c3",
      "#92c5de",
      "#d1e5f0",
      "#f7f7f7",
      "#f4a582",
      "#d6604d",
      "#b2182b",
      "#67001f",
    ]);
  });

  it("drops a shorter cold side's surplus from the neutral outward, as the warm side's", () => {
    const neutralFifth = binsOfLength(10);
    const table = new Map<ClassifierBins, PaletteEntry>([[neutralFifth, palettes.diverging(4)]]);
    expect(bandColors(neutralFifth, table)).toEqual([
      "#053061",
      "#2166ac",
      "#4393c3",
      "#92c5de",
      "#f7f7f7",
      "#fddbc7",
      "#f4a582",
      "#d6604d",
      "#b2182b",
      "#67001f",
    ]);
  });

  it("throws for a diverging entry whose neutral the band count cannot centre, naming the classifier", () => {
    const tenBands = binsOfLength(10);
    for (const neutral of [-1, 10, 4.5]) {
      const table = new Map<ClassifierBins, PaletteEntry>([[tenBands, palettes.diverging(neutral)]]);
      expect(() => bandColors(tenBands, table), String(neutral)).toThrow('"band 1" … "band 10"');
    }
  });

  it("throws for a count its family lacks, naming the classifier", () => {
    // Nine bands centred on the fifth read RdBu-9, ten sequential ones YlOrRd-11; neither is copied.
    const nineBands = binsOfLength(9);
    const tenBands = binsOfLength(10);
    const table = new Map<ClassifierBins, PaletteEntry>([
      [nineBands, palettes.diverging(4)],
      [tenBands, palettes.sequential],
    ]);
    expect(() => bandColors(nineBands, table)).toThrow('"band 1" … "band 9"');
    expect(() => bandColors(tenBands, table)).toThrow('"band 1" … "band 10"');
  });

  it("throws for a classifier not in the table, naming it by its first and last labels", () => {
    expect(() => bandColors(binsOfLength(10))).toThrow('"band 1" … "band 10"');
  });

  it("has an entry whose colour count is its band count for every classifier a registered model paints", () => {
    // The Compliance column paints each classified output; the scan's
    // declared bands are Explore's default Band list.
    for (const model of registeredModels) {
      const painted = Object.entries(model.info.outputs).flatMap(([key, variable]) =>
        variable.classifier ? [{ name: `${model.info.label} ${key}`, bins: variable.classifier }] : [],
      );
      if (model.scan) {
        painted.push({ name: `${model.info.label} scan`, bins: model.scan.classifier });
      }
      for (const { name, bins } of painted) {
        expect(bandColors(bins), name).toHaveLength(bins.labels.length);
      }
    }
  });
});

describe("colorForBand", () => {
  it("colours a category as the table colours its band", () => {
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Cold")).toBe(rdBu7[0]);
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Neutral")).toBe(rdBu7[3]);
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Hot")).toBe(rdBu7[6]);
    expect(colorForBand(PMV_CATEGORY_BINS_ISO, "B")).toBe("#fd8d3c");
  });

  it("returns nothing for \"none\" and for a category past the last Edge or not named", () => {
    expect(colorForBand(PMV_CATEGORY_BINS_ISO, "none")).toBeUndefined();
    expect(colorForBand(PMV_CATEGORY_BINS_ISO, Number.NaN)).toBeUndefined();
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Freezing")).toBeUndefined();
  });
});

describe("chartInk", () => {
  /** A hex colour's lightness, the sum of its three channels. */
  const lightnessOf = (color: string) => [1, 3, 5].reduce((sum, start) => sum + Number.parseInt(color.slice(start, start + 2), 16), 0);

  it("draws a band's Edge in a neutral colour darker than the isolines, told from them and from the saturation line", () => {
    expect(chartInk.bandLine).not.toBe(chartInk.isoline);
    expect(chartInk.bandLine).not.toBe(chartInk.saturationLine);
    expect(lightnessOf(chartInk.bandLine)).toBeLessThan(lightnessOf(chartInk.isoline));
  });

  it("draws a band's Edge at 1 px, thinner than a Comfort zone's outline", () => {
    expect(chartInk.bandLineWidth).toBe(1);
    expect(chartInk.bandLineWidth).toBeLessThan(chartInk.zoneLineWidth);
  });
});
