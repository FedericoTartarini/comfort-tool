import { describe, expect, it } from "vitest";
import {
  HEAT_INDEX_STRESS_CATEGORY_BINS,
  PMV_CATEGORY_BINS_ISO,
  PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE,
  PMV_THERMAL_SENSATION_VOTE_BINS_ISO,
  type ClassifierBins,
} from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { bandColors, colorForBand, palettes, type PaletteEntry } from "./bandPalette";

// The fills the CBE tool has published for Cold … Hot.
const cbeFills = ["#0571b0", "#4c78a8", "#92c5de", "#f2f2f2", "#f4a582", "#e15759", "#cc79a7"];

const binsOfLength = (count: number): ClassifierBins => {
  const labels = Array.from({ length: count }, (_, index) => `band ${index + 1}`);
  return { labels, edges: labels.map((_, index) => index), right: true };
};

const isHex = (color: string | undefined) => /^#[0-9a-f]{6}$/.test(color ?? "");

describe("bandColors", () => {
  it("gives the thermal-sensation bins of either standard the seven CBE fills", () => {
    expect(bandColors(PMV_THERMAL_SENSATION_VOTE_BINS_ISO)).toEqual(cbeFills);
    expect(bandColors(PMV_THERMAL_SENSATION_VOTE_BINS_ASHRAE)).toEqual(cbeFills);
  });

  it("gives Heat Index's five stress categories five colours of one sequential family, safe to dangerous", () => {
    const colors = bandColors(HEAT_INDEX_STRESS_CATEGORY_BINS);
    expect(colors).toHaveLength(5);
    expect(colors.every(isHex)).toBe(true);
    expect(new Set(colors).size).toBe(5);
    // YlOrRd darkens towards its last colour: "extreme danger" is the darkest.
    expect(colors[4]).toBe("#bd0026");
  });

  it("gives ISO 7730's A, B and C three colours of one sequential family and \"none\" no colour", () => {
    // Read, as every classifier is, at its band count: YlOrRd's four, the fourth left unpainted.
    expect(bandColors(PMV_CATEGORY_BINS_ISO)).toEqual(["#ffffb2", "#fecc5c", "#fd8d3c", undefined]);
  });

  it("gives a ten-label classifier with an entry in the table ten colours", () => {
    const tenBands = binsOfLength(10);
    const table = new Map<ClassifierBins, PaletteEntry>([[tenBands, palettes.diverging]]);
    const colors = bandColors(tenBands, table);
    expect(colors).toHaveLength(10);
    expect(colors.every(isHex)).toBe(true);
    expect(new Set(colors).size).toBe(10);
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
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Cold")).toBe(cbeFills[0]);
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Neutral")).toBe(cbeFills[3]);
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Hot")).toBe(cbeFills[6]);
    expect(colorForBand(PMV_CATEGORY_BINS_ISO, "B")).toBe("#fecc5c");
  });

  it("returns nothing for \"none\" and for a category past the last Edge or not named", () => {
    expect(colorForBand(PMV_CATEGORY_BINS_ISO, "none")).toBeUndefined();
    expect(colorForBand(PMV_CATEGORY_BINS_ISO, Number.NaN)).toBeUndefined();
    expect(colorForBand(PMV_THERMAL_SENSATION_VOTE_BINS_ISO, "Freezing")).toBeUndefined();
  });
});
