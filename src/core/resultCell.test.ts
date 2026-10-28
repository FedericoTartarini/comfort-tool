import { describe, expect, it } from "vitest";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { violationRows, type ViolationRow } from "./applicability";
import type { RegisteredModel } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "./quantities";
import { formatResultCell } from "./resultCell";
import { startingSlot, withEnteredValues } from "./slot";
import { unitSystem } from "./unitSystem";

const q = quantities;

const atDefaults = (model: RegisteredModel) => runOn(startingSlot(model), model, DEFAULT_ATMOSPHERIC_PRESSURE);
const atTdb = (model: RegisteredModel, tdb: number) =>
  runOn(withEnteredValues(startingSlot(model), new Map([[q.tdb, tdb]])), model, DEFAULT_ATMOSPHERIC_PRESSURE);

const noViolations: readonly ViolationRow[] = [];
// A run that broke its air-speed row, as `violationRows` reports one.
const brokenAirSpeed: readonly ViolationRow[] = [{ quantity: q.v, bounded: q.vr, role: "derived", value: 1, bound: { max: 0.8 } }];

describe("formatResultCell", () => {
  it("shows a boolean result as Yes or No in either unit system", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(pmvPpdAshrae, result, q.acceptability_80, system, noViolations)).toBe("Yes");
      expect(formatResultCell(pmvPpdAshrae, result, q.compliance, system, noViolations)).toBe("No");
    }
  });

  it("reads PMV (ASHRAE 55)'s compliance, a column of its table, as Yes inside the interval and No outside", () => {
    expect(pmvPpdAshrae.table).toContain(q.compliance);
    expect(formatResultCell(pmvPpdAshrae, atDefaults(pmvPpdAshrae), q.compliance, unitSystem.si, noViolations)).toBe("Yes");
    expect(formatResultCell(pmvPpdAshrae, atTdb(pmvPpdAshrae, 35), q.compliance, unitSystem.si, noViolations)).toBe("No");
  });

  it("shows every boolean result as a dash beside a violation row, whatever its value", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(pmvPpdAshrae, result, q.acceptability_80, system, brokenAirSpeed)).toBe("—");
      expect(formatResultCell(pmvPpdAshrae, result, q.compliance, system, brokenAirSpeed)).toBe("—");
    }
  });

  it("formats a number the same beside a violation row as without one", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.ip, brokenAirSpeed)).toEqual(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.ip, noViolations));
    expect(formatResultCell(pmvPpdAshrae, result, q.pmv, unitSystem.si, brokenAirSpeed)).toBe("0.5");
  });

  // ADR-0002 decision 77 rule 2: as pythermalcomfort's NaN under its own gate, the row says why.
  it("reads PMV (ASHRAE 55)'s compliance as a dash, and PMV and PPD as numbers, at 28 °C and 1.0 m/s without local control", () => {
    const slot = withEnteredValues(
      startingSlot(pmvPpdAshrae),
      new Map<Quantity, number>([[q.tdb, 28], [q.tr, 28], [q.v, 1], [q.met, 1], [q.clo, 0.61]]),
    );
    const result = runOn(slot, pmvPpdAshrae, DEFAULT_ATMOSPHERIC_PRESSURE);
    const rows = violationRows(pmvPpdAshrae, result, slot);
    expect(rows.map((row) => row.bounded)).toEqual([q.vr]);
    expect(formatResultCell(pmvPpdAshrae, result, q.compliance, unitSystem.si, rows)).toBe("—");
    expect(formatResultCell(pmvPpdAshrae, result, q.compliance, unitSystem.si, noViolations)).toBe("Yes");
    for (const quantity of [q.pmv, q.ppd]) {
      expect(formatResultCell(pmvPpdAshrae, result, quantity, unitSystem.si, rows)).toEqual(formatResultCell(pmvPpdAshrae, result, quantity, unitSystem.si, noViolations));
      expect(formatResultCell(pmvPpdAshrae, result, quantity, unitSystem.si, rows)).not.toBe("—");
    }
  });

  it("formats a number in the display unit", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.si, noViolations)).toBe("24.57 °C");
    expect(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.ip, noViolations)).toBe("76.22 °F");
    expect(formatResultCell(pmvPpdAshrae, result, q.pmv, unitSystem.si, noViolations)).toBe("0.5");
  });

  it("shows a dash for a non-finite number, a missing key and no result, beside a violation row too", () => {
    const result = { pmv: Number.NaN };
    for (const violations of [noViolations, brokenAirSpeed]) {
      expect(formatResultCell(pmvPpdAshrae, result, q.pmv, unitSystem.si, violations)).toBe("—");
      expect(formatResultCell(pmvPpdAshrae, result, q.ppd, unitSystem.si, violations)).toBe("—");
      expect(formatResultCell(pmvPpdAshrae, null, q.pmv, unitSystem.si, violations)).toBe("—");
      expect(formatResultCell(pmvPpdAshrae, null, q.compliance, unitSystem.si, violations)).toBe("—");
    }
  });

  it("shows a classified output's category as its band's label", () => {
    // Neutral is the fourth of the seven sensation labels, II the second of I, II, III, IV, none.
    expect(formatResultCell(pmvPpdIso, atDefaults(pmvPpdIso), q.tsv, unitSystem.si, noViolations)).toBe("Neutral");
    expect(formatResultCell(pmvPpdIso, atDefaults(pmvPpdIso), q.category, unitSystem.si, noViolations)).toBe("II");
    expect(formatResultCell(pmvPpdAshrae, atDefaults(pmvPpdAshrae), q.tsv, unitSystem.si, noViolations)).toBe("Neutral");
  });

  it("shows a point outside every category by the band its classifier names for it", () => {
    // A tdb of 5 °C puts PMV near -4.3: Cold, and past category IV, so "none".
    const result = atTdb(pmvPpdIso, 5);
    expect(formatResultCell(pmvPpdIso, result, q.tsv, unitSystem.si, noViolations)).toBe("Cold");
    expect(formatResultCell(pmvPpdIso, result, q.category, unitSystem.si, noViolations)).toBe("none");
  });

  it("shows a dash for a NaN, a category its classifier does not name, and no result", () => {
    const result = { pmv: 12, tsv: Number.NaN, category: "VI" };
    expect(formatResultCell(pmvPpdIso, result, q.tsv, unitSystem.si, noViolations)).toBe("—");
    expect(formatResultCell(pmvPpdIso, result, q.category, unitSystem.si, noViolations)).toBe("—");
    expect(formatResultCell(pmvPpdIso, null, q.tsv, unitSystem.si, noViolations)).toBe("—");
    expect(formatResultCell(pmvPpdIso, null, q.category, unitSystem.si, noViolations)).toBe("—");
  });

  it("keeps a category beside a violation row, where a yes or no reads the dash", () => {
    const result = { tsv: "Neutral", compliance: true };
    expect(formatResultCell(pmvPpdAshrae, result, q.tsv, unitSystem.si, brokenAirSpeed)).toBe("Neutral");
    expect(formatResultCell(pmvPpdAshrae, result, q.compliance, unitSystem.si, brokenAirSpeed)).toBe("—");
  });
});
