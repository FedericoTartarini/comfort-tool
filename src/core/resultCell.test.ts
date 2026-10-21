import { describe, expect, it } from "vitest";
import { PMV_CATEGORY_BINS_ISO_7730_2025, PMV_THERMAL_SENSATION_VOTE_BINS_ISO } from "jsthermalcomfort";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { violationRows, type ViolationRow } from "./applicability";
import { bandColors } from "./bandPalette";
import type { RegisteredModel } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "./quantities";
import { classifiedOutputs, formatResultCell } from "./resultCell";
import { startingSlot, withEnteredValues } from "./slot";
import { unitSystem } from "./unitSystem";

const q = quantities;

const sensation = bandColors(PMV_THERMAL_SENSATION_VOTE_BINS_ISO);
const isoCategory = bandColors(PMV_CATEGORY_BINS_ISO_7730_2025);

const atDefaults = (model: RegisteredModel) => runOn(startingSlot(model), model, DEFAULT_ATMOSPHERIC_PRESSURE);
const atTdb = (model: RegisteredModel, tdb: number) =>
  runOn(withEnteredValues(startingSlot(model), new Map([[q.tdb, tdb]])), model, DEFAULT_ATMOSPHERIC_PRESSURE);

const noViolations: readonly ViolationRow[] = [];
// A run that broke its air-speed row, as `violationRows` reports one.
const brokenAirSpeed: readonly ViolationRow[] = [{ quantity: q.v, bounded: q.vr, role: "derived", value: 1, bound: { max: 0.8 } }];

describe("formatResultCell", () => {
  /** The cell as the table shows it: its text, and whether its dash stands for a violation. */
  const shown = (text: string, violation = false) => ({ text, violation });

  it("shows a boolean result as Yes or No in either unit system", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(result, q.acceptability_80, system, noViolations)).toEqual(shown("Yes"));
      expect(formatResultCell(result, q.compliance, system, noViolations)).toEqual(shown("No"));
    }
  });

  it("reads PMV (ASHRAE 55)'s compliance, a column of its table, as Yes inside the interval and No outside", () => {
    expect(pmvPpdAshrae.table).toContain(q.compliance);
    expect(formatResultCell(atDefaults(pmvPpdAshrae), q.compliance, unitSystem.si, noViolations)).toEqual(shown("Yes"));
    expect(formatResultCell(atTdb(pmvPpdAshrae, 35), q.compliance, unitSystem.si, noViolations)).toEqual(shown("No"));
  });

  it("shows every boolean result as a dash marked as a violation's beside a violation row, whatever its value", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(result, q.acceptability_80, system, brokenAirSpeed)).toEqual(shown("—", true));
      expect(formatResultCell(result, q.compliance, system, brokenAirSpeed)).toEqual(shown("—", true));
    }
  });

  it("formats a number the same, unmarked, beside a violation row as without one", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(result, q.tmp_cmf, unitSystem.ip, brokenAirSpeed)).toEqual(formatResultCell(result, q.tmp_cmf, unitSystem.ip, noViolations));
    expect(formatResultCell(result, q.pmv, unitSystem.si, brokenAirSpeed)).toEqual(shown("0.5"));
  });

  // ADR-0002 decision 77 rule 2: as pythermalcomfort's NaN under its own gate, the row says why.
  it("reads PMV (ASHRAE 55)'s compliance as a violation's dash, and PMV and PPD as numbers, at 28 °C and 1.0 m/s without local control", () => {
    const slot = withEnteredValues(
      startingSlot(pmvPpdAshrae),
      new Map<Quantity, number>([[q.tdb, 28], [q.tr, 28], [q.v, 1], [q.met, 1], [q.clo, 0.61]]),
    );
    const result = runOn(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE);
    const rows = violationRows(pmvPpdAshrae, result, slot);
    expect(rows.map((row) => row.bounded)).toEqual([q.vr]);
    expect(formatResultCell(result, q.compliance, unitSystem.si, rows)).toEqual(shown("—", true));
    expect(formatResultCell(result, q.compliance, unitSystem.si, noViolations)).toEqual(shown("Yes"));
    for (const quantity of [q.pmv, q.ppd]) {
      expect(formatResultCell(result, quantity, unitSystem.si, rows)).toEqual(formatResultCell(result, quantity, unitSystem.si, noViolations));
      expect(formatResultCell(result, quantity, unitSystem.si, rows).text).not.toBe("—");
    }
  });

  it("formats a number in the display unit", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(result, q.tmp_cmf, unitSystem.si, noViolations)).toEqual(shown("24.57 °C"));
    expect(formatResultCell(result, q.tmp_cmf, unitSystem.ip, noViolations)).toEqual(shown("76.22 °F"));
    expect(formatResultCell(result, q.pmv, unitSystem.si, noViolations)).toEqual(shown("0.5"));
  });

  it("shows an unmarked dash for a category, a non-finite number, a missing key and no result, beside a violation row too", () => {
    const result = { tsv: "Neutral", pmv: Number.NaN };
    for (const violations of [noViolations, brokenAirSpeed]) {
      expect(formatResultCell(result, q.tsv, unitSystem.si, violations)).toEqual(shown("—"));
      expect(formatResultCell(result, q.pmv, unitSystem.si, violations)).toEqual(shown("—"));
      expect(formatResultCell(result, q.ppd, unitSystem.si, violations)).toEqual(shown("—"));
      expect(formatResultCell(null, q.pmv, unitSystem.si, violations)).toEqual(shown("—"));
      expect(formatResultCell(null, q.compliance, unitSystem.si, violations)).toEqual(shown("—"));
    }
  });
});

describe("classifiedOutputs", () => {
  it("reads each classified output's category and colours it from the output's own classifier's palette", () => {
    // Neutral is the fourth of the seven sensation labels, II the second of I, II, III, IV, none.
    expect(classifiedOutputs(pmvPpdIso, atDefaults(pmvPpdIso))).toEqual([
      { quantity: q.tsv, category: "Neutral", color: sensation[3] },
      { quantity: q.category, category: "II", color: isoCategory[1] },
    ]);
    expect(classifiedOutputs(pmvPpdAshrae, atDefaults(pmvPpdAshrae))).toEqual([
      { quantity: q.tsv, category: "Neutral", color: sensation[3] },
    ]);
  });

  it("keeps a point outside every category, with no colour", () => {
    // A tdb of 5 °C puts PMV near -4.3: Cold, and past category C, so "none".
    expect(classifiedOutputs(pmvPpdIso, atTdb(pmvPpdIso, 5))).toEqual([
      { quantity: q.tsv, category: "Cold", color: sensation[0] },
      { quantity: q.category, category: "none", color: undefined },
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
