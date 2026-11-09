import { describe, expect, it } from "vitest";
import { HEAT_INDEX_ROTHFUSZ_INFO, PMV_PPD_ASHRAE_INFO, PMV_PPD_ISO_INFO, UTCI_INFO, type ClassifierBins } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { bandColors, chartInk, colorForBand, letteringOn, palettes, type BandPalette } from "./bandPalette";
import { classifierOf } from "./modelDeclaration";
import { palette } from "./palette";
import { quantities } from "./quantities";

const isoSensation = classifierOf(PMV_PPD_ISO_INFO, quantities.tsv);
const ashraeSensation = classifierOf(PMV_PPD_ASHRAE_INFO, quantities.tsv);
const isoCategory = classifierOf(PMV_PPD_ISO_INFO, quantities.category);
const heatIndexStress = classifierOf(HEAT_INDEX_ROTHFUSZ_INFO, quantities.stress_category);
const utciThermalStressCategory = classifierOf(UTCI_INFO, quantities.stress_category);

// ColorBrewer's RdBu-7, read cold to hot: the thermal-sensation scale's Cold … Hot.
const rdBu7 = ["#2166ac", "#67a9cf", "#d1e5f0", "#f7f7f7", "#fddbc7", "#ef8a62", "#b2182b"];

const binsOfLength = (count: number): ClassifierBins => {
  const labels = Array.from({ length: count }, (_, index) => `band ${index + 1}`);
  return { labels, edges: labels.map((_, index) => index), right: true };
};

describe("bandColors", () => {
  it("gives the thermal-sensation bins of either standard RdBu-7, Neutral its grey at the fourth position", () => {
    expect(bandColors(isoSensation)).toEqual(rdBu7);
    expect(bandColors(ashraeSensation)).toEqual(rdBu7);
    expect(colorForBand(isoSensation, "Neutral")).toBe("#f7f7f7");
  });

  it("gives Heat Index's five stress categories YlOrRd-6 without its lightest, so \"no risk\" is not near white", () => {
    expect(bandColors(heatIndexStress)).toEqual(["#fed976", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"]);
  });

  it("gives ISO 7730:2025's five bands YlOrRd-6 without its lightest, \"none\" unpainted", () => {
    expect(bandColors(isoCategory)).toEqual(["#fed976", "#feb24c", "#fd8d3c", "#f03b20", undefined]);
  });

  it("gives UTCI's ten stress categories five blues, RdBu-11's grey at the sixth position and four reds", () => {
    // RdBu-11 centred on "no thermal stress": the warm side's surplus, the red next to the grey, dropped.
    expect(bandColors(utciThermalStressCategory)).toEqual([
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
    const table = new Map<ClassifierBins, BandPalette>([[neutralFifth, palettes.diverging(4)]]);
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

  it("throws for a diverging palette whose neutral the band count cannot centre, naming the classifier", () => {
    const tenBands = binsOfLength(10);
    for (const neutral of [-1, 10, 4.5]) {
      const table = new Map<ClassifierBins, BandPalette>([[tenBands, palettes.diverging(neutral)]]);
      expect(() => bandColors(tenBands, table), String(neutral)).toThrow('"band 1" … "band 10"');
    }
  });

  it("throws for a count its family lacks, naming the classifier", () => {
    // Nine bands centred on the fifth read RdBu-9, ten sequential ones YlOrRd-11; neither is copied.
    const nineBands = binsOfLength(9);
    const tenBands = binsOfLength(10);
    const table = new Map<ClassifierBins, BandPalette>([
      [nineBands, palettes.diverging(4)],
      [tenBands, palettes.sequential],
    ]);
    expect(() => bandColors(nineBands, table)).toThrow('"band 1" … "band 9"');
    expect(() => bandColors(tenBands, table)).toThrow('"band 1" … "band 10"');
  });

  it("throws for a classifier not in the table, naming it by its first and last labels", () => {
    expect(() => bandColors(binsOfLength(10))).toThrow('"band 1" … "band 10"');
  });

  it("has a palette whose colour count is its band count for every classifier a registered model paints", () => {
    // Each classified output is a column of the result table; the scan's
    // declared bands are Explore's default Band list.
    for (const model of registeredModels) {
      const painted = Object.entries(model.info.outputs).flatMap(([key, field]) =>
        field.classifier ? [{ name: `${model.info.label} ${key}`, bins: field.classifier }] : [],
      );
      if (model.scan) {
        painted.push({ name: `${model.info.label} scan`, bins: classifierOf(model.info, model.scan.bands) });
      }
      for (const { name, bins } of painted) {
        expect(bandColors(bins), name).toHaveLength(bins.labels.length);
      }
    }
  });
});

describe("colorForBand", () => {
  it("colours a category as the table colours its band", () => {
    expect(colorForBand(isoSensation, "Cold")).toBe(rdBu7[0]);
    expect(colorForBand(isoSensation, "Neutral")).toBe(rdBu7[3]);
    expect(colorForBand(isoSensation, "Hot")).toBe(rdBu7[6]);
    expect(colorForBand(isoCategory, "II")).toBe("#feb24c");
  });

  it("returns nothing for \"none\" and for a category past the last Edge or not named", () => {
    expect(colorForBand(isoCategory, "none")).toBeUndefined();
    expect(colorForBand(isoCategory, Number.NaN)).toBeUndefined();
    expect(colorForBand(isoSensation, "Freezing")).toBeUndefined();
  });
});

describe("letteringOn", () => {
  // The pairs ADR-0002 decision 85's Facts computed by WCAG 2's contrast ratio.
  it("letters a pale fill and #f03b20 in ink", () => {
    for (const fill of ["#f7f7f7", "#fddbc7", "#fecc5c", "#f03b20"]) {
      expect(letteringOn(fill), fill).toBe(palette.ink);
    }
  });

  it("letters a dark fill in white", () => {
    for (const fill of ["#b2182b", "#2166ac", "#bd0026"]) {
      expect(letteringOn(fill), fill).toBe("#ffffff");
    }
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
