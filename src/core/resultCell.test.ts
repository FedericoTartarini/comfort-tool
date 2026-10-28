import { describe, expect, it } from "vitest";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { violationRows, type ViolationRow } from "./applicability";
import { palette } from "./palette";
import type { RegisteredModel } from "./modelDeclaration";
import { runOn } from "./modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities, type Quantity } from "./quantities";
import { formatResultCell, type ResultCell } from "./resultCell";
import { startingSlot, withEnteredValues } from "./slot";
import { unitSystem } from "./unitSystem";

const q = quantities;

const atDefaults = (model: RegisteredModel) => runOn(startingSlot(model), model, DEFAULT_ATMOSPHERIC_PRESSURE);
const atTdb = (model: RegisteredModel, tdb: number) =>
  runOn(withEnteredValues(startingSlot(model), new Map([[q.tdb, tdb]])), model, DEFAULT_ATMOSPHERIC_PRESSURE);

/** A cell of text. */
const text = (shown: string): ResultCell => ({ kind: "text", text: shown });

// ColorBrewer's RdBu-7 read cold to hot, and YlOrRd-6 without its lightest, as the band palette's tests have them.
const coldFill = "#2166ac";
const neutralFill = "#f7f7f7";
const categoryIIFill = "#feb24c";
const white = "#ffffff";

const noViolations: readonly ViolationRow[] = [];
// A run that broke its air-speed row, as `violationRows` reports one.
const brokenAirSpeed: readonly ViolationRow[] = [{ quantity: q.v, bounded: q.vr, role: "derived", value: 1, bound: { max: 0.8 } }];

describe("formatResultCell", () => {
  it("shows a boolean result as Yes or No in either unit system", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(pmvPpdAshrae, result, q.acceptability_80, system, noViolations)).toEqual(text("Yes"));
      expect(formatResultCell(pmvPpdAshrae, result, q.compliance, system, noViolations)).toEqual(text("No"));
    }
  });

  it("reads PMV (ASHRAE 55)'s compliance, a column of its table, as Yes inside the interval and No outside", () => {
    expect(pmvPpdAshrae.table).toContain(q.compliance);
    expect(formatResultCell(pmvPpdAshrae, atDefaults(pmvPpdAshrae), q.compliance, unitSystem.si, noViolations)).toEqual(text("Yes"));
    expect(formatResultCell(pmvPpdAshrae, atTdb(pmvPpdAshrae, 35), q.compliance, unitSystem.si, noViolations)).toEqual(text("No"));
  });

  it("shows every boolean result as a dash beside a violation row, whatever its value", () => {
    const result = { acceptability_80: true, compliance: false };
    for (const system of [unitSystem.si, unitSystem.ip]) {
      expect(formatResultCell(pmvPpdAshrae, result, q.acceptability_80, system, brokenAirSpeed)).toEqual(text("—"));
      expect(formatResultCell(pmvPpdAshrae, result, q.compliance, system, brokenAirSpeed)).toEqual(text("—"));
    }
  });

  it("formats a number the same beside a violation row as without one", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.ip, brokenAirSpeed)).toEqual(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.ip, noViolations));
    expect(formatResultCell(pmvPpdAshrae, result, q.pmv, unitSystem.si, brokenAirSpeed)).toEqual(text("0.5"));
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
    expect(formatResultCell(pmvPpdAshrae, result, q.compliance, unitSystem.si, rows)).toEqual(text("—"));
    expect(formatResultCell(pmvPpdAshrae, result, q.compliance, unitSystem.si, noViolations)).toEqual(text("Yes"));
    for (const quantity of [q.pmv, q.ppd]) {
      expect(formatResultCell(pmvPpdAshrae, result, quantity, unitSystem.si, rows)).toEqual(formatResultCell(pmvPpdAshrae, result, quantity, unitSystem.si, noViolations));
      expect(formatResultCell(pmvPpdAshrae, result, quantity, unitSystem.si, rows)).not.toEqual(text("—"));
    }
  });

  it("formats a number in the display unit", () => {
    const result = { tmp_cmf: 24.567, pmv: 0.5 };
    expect(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.si, noViolations)).toEqual(text("24.57 °C"));
    expect(formatResultCell(pmvPpdAshrae, result, q.tmp_cmf, unitSystem.ip, noViolations)).toEqual(text("76.22 °F"));
    expect(formatResultCell(pmvPpdAshrae, result, q.pmv, unitSystem.si, noViolations)).toEqual(text("0.5"));
  });

  it("shows a dash for a non-finite number, a missing key and no result, beside a violation row too", () => {
    const result = { pmv: Number.NaN };
    for (const violations of [noViolations, brokenAirSpeed]) {
      expect(formatResultCell(pmvPpdAshrae, result, q.pmv, unitSystem.si, violations)).toEqual(text("—"));
      expect(formatResultCell(pmvPpdAshrae, result, q.ppd, unitSystem.si, violations)).toEqual(text("—"));
      expect(formatResultCell(pmvPpdAshrae, null, q.pmv, unitSystem.si, violations)).toEqual(text("—"));
      expect(formatResultCell(pmvPpdAshrae, null, q.compliance, unitSystem.si, violations)).toEqual(text("—"));
    }
  });

  it("shows a classified output's category as a Band badge in its band's fill, lettered in ink on a pale one", () => {
    // Neutral is the fourth of the seven sensation labels, II the second of I, II, III, IV, none.
    const neutral: ResultCell = { kind: "band", label: "Neutral", paint: { fill: neutralFill, lettering: palette.ink } };
    expect(formatResultCell(pmvPpdIso, atDefaults(pmvPpdIso), q.tsv, unitSystem.si, noViolations)).toEqual(neutral);
    expect(formatResultCell(pmvPpdIso, atDefaults(pmvPpdIso), q.category, unitSystem.si, noViolations)).toEqual({
      kind: "band",
      label: "II",
      paint: { fill: categoryIIFill, lettering: palette.ink },
    });
    expect(formatResultCell(pmvPpdAshrae, atDefaults(pmvPpdAshrae), q.tsv, unitSystem.si, noViolations)).toEqual(neutral);
  });

  it("letters a dark band's badge in white, and gives a band its palette leaves unpainted no fill", () => {
    // A tdb of 5 °C puts PMV near -4.3: Cold, the first band, and past category IV, so "none".
    const result = atTdb(pmvPpdIso, 5);
    expect(formatResultCell(pmvPpdIso, result, q.tsv, unitSystem.si, noViolations)).toEqual({
      kind: "band",
      label: "Cold",
      paint: { fill: coldFill, lettering: white },
    });
    expect(formatResultCell(pmvPpdIso, result, q.category, unitSystem.si, noViolations)).toEqual({ kind: "band", label: "none", paint: undefined });
  });

  it("shows a dash for a NaN, a category its classifier does not name, and no result", () => {
    const result = { pmv: 12, tsv: Number.NaN, category: "VI" };
    expect(formatResultCell(pmvPpdIso, result, q.tsv, unitSystem.si, noViolations)).toEqual(text("—"));
    expect(formatResultCell(pmvPpdIso, result, q.category, unitSystem.si, noViolations)).toEqual(text("—"));
    expect(formatResultCell(pmvPpdIso, null, q.tsv, unitSystem.si, noViolations)).toEqual(text("—"));
    expect(formatResultCell(pmvPpdIso, null, q.category, unitSystem.si, noViolations)).toEqual(text("—"));
  });

  it("keeps a Band badge beside a violation row, where a yes or no reads the dash", () => {
    const result = { tsv: "Neutral", compliance: true };
    expect(formatResultCell(pmvPpdAshrae, result, q.tsv, unitSystem.si, brokenAirSpeed)).toEqual(formatResultCell(pmvPpdAshrae, result, q.tsv, unitSystem.si, noViolations));
    expect(formatResultCell(pmvPpdAshrae, result, q.tsv, unitSystem.si, brokenAirSpeed)).toMatchObject({ kind: "band", label: "Neutral" });
    expect(formatResultCell(pmvPpdAshrae, result, q.compliance, unitSystem.si, brokenAirSpeed)).toEqual(text("—"));
  });
});
