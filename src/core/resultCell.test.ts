import { describe, expect, it } from "vitest";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { sensationPalette } from "./bandPalette";
import { defaultSlot } from "./declarationTestSlots";
import { withEnteredValues } from "./libraryInputs";
import type { RegisteredModel } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { quantities } from "./quantities";
import { classifiedOutputs, formatResultCell } from "./resultCell";
import { unitSystem } from "./unitSystem";

const q = quantities;

describe("formatResultCell", () => {
  it("shows a boolean result as Yes or No in either unit system", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(result, q.acceptability_80, system)).toBe("Yes");
      expect(formatResultCell(result, q.compliance, system)).toBe("No");
    }
  });

  it("formats a number in the display unit", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(result, q.tmp_cmf, unitSystem.si)).toBe("24.57 °C");
    expect(formatResultCell(result, q.tmp_cmf, unitSystem.ip)).toBe("76.22 °F");
    expect(formatResultCell(result, q.pmv, unitSystem.si)).toBe("0.5");
  });

  it("shows a dash for a category, a non-finite number, a missing key and no result", () => {
    const result = { tsv: "Neutral", pmv: Number.NaN };
    expect(formatResultCell(result, q.tsv, unitSystem.si)).toBe("—");
    expect(formatResultCell(result, q.pmv, unitSystem.si)).toBe("—");
    expect(formatResultCell(result, q.ppd, unitSystem.si)).toBe("—");
    expect(formatResultCell(null, q.pmv, unitSystem.si)).toBe("—");
  });
});

describe("classifiedOutputs", () => {
  const atDefaults = (model: RegisteredModel) => runOn(defaultSlot(model), model);
  const atTdb = (model: RegisteredModel, tdb: number) =>
    runOn(withEnteredValues(defaultSlot(model), new Map([[q.tdb, tdb]])), model);

  it("reads each classified output's category and colours it by its place in the output's own classifier", () => {
    // Neutral is the fourth of the seven sensation labels, B the second of A, B, C, none.
    expect(classifiedOutputs(pmvPpdIso, atDefaults(pmvPpdIso))).toEqual([
      { quantity: q.tsv, category: "Neutral", color: sensationPalette[3] },
      { quantity: q.category, category: "B", color: sensationPalette[1] },
    ]);
    expect(classifiedOutputs(pmvPpdAshrae, atDefaults(pmvPpdAshrae))).toEqual([
      { quantity: q.tsv, category: "Neutral", color: sensationPalette[3] },
    ]);
  });

  it("keeps a point outside every category, coloured as the classifier's own last label", () => {
    // A tdb of 5 °C puts PMV near -4.3: Cold, and past category C, so "none".
    expect(classifiedOutputs(pmvPpdIso, atTdb(pmvPpdIso, 5))).toEqual([
      { quantity: q.tsv, category: "Cold", color: sensationPalette[0] },
      { quantity: q.category, category: "none", color: sensationPalette[3] },
    ]);
  });

  it("keeps a category the classifier does not name, with no colour", () => {
    const result = { pmv: 12, tsv: Number.NaN, category: "none" };
    expect(classifiedOutputs(pmvPpdIso, result)[0]).toEqual({ quantity: q.tsv, category: Number.NaN, color: undefined });
  });

  it("lists no output the info gives no classifier, yes-or-no outputs among them", () => {
    // Adaptive's acceptability outputs and ASHRAE's compliance are booleans with no classifier.
    expect(classifiedOutputs(adaptiveAshrae, atDefaults(adaptiveAshrae))).toEqual([]);
    expect(classifiedOutputs(pmvPpdAshrae, atTdb(pmvPpdAshrae, 35)).map((entry) => entry.quantity)).toEqual([q.tsv]);
  });

  it("lists nothing before the first run", () => {
    expect(classifiedOutputs(pmvPpdIso, null)).toEqual([]);
  });
});
