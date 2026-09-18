import { describe, expect, it } from "vitest";
import { pmv_ppd_iso, Standard } from "jsthermalcomfort";
import { pmvIso } from "$lib/models/pmvIso";
import {
  derivedViolations,
  enteredBound,
  outOfRangeInputs,
  outputViolations,
  vapourPressure,
} from "./applicability";
import { bisect } from "$lib/temporary-library/root_finding";
import { humidityMode, temperatureMode } from "./entryModes";
import { toLibraryInputs, type SlotInputs } from "./libraryInputs";
import { quantities, type Quantity } from "./quantities";

const q = quantities;

function separateSlot(overrides: Partial<Record<"tdb" | "tr" | "v" | "met" | "clo", number>> = {}): SlotInputs {
  const values = { tdb: 25, tr: 25, v: 0.1, met: 1.1, clo: 0.5, ...overrides };
  return {
    values: new Map<Quantity, number>([
      [q.tdb, values.tdb],
      [q.tr, values.tr],
      [q.v, values.v],
      [q.met, values.met],
      [q.clo, values.clo],
    ]),
    humidity: { mode: humidityMode.rh, value: 50 },
    temperature: { mode: temperatureMode.separate },
  };
}

function operativeSlot(operative: number): SlotInputs {
  return {
    values: new Map<Quantity, number>([
      [q.operative_tmp, operative],
      [q.v, 0.1],
      [q.met, 1.1],
      [q.clo, 0.5],
    ]),
    humidity: { mode: humidityMode.rh, value: 50 },
    temperature: { mode: temperatureMode.operative },
  };
}

describe("enteredBound / outOfRangeInputs", () => {
  it("is empty when every entered value is within the model's bounds", () => {
    expect(outOfRangeInputs(separateSlot(), pmvIso)).toEqual([]);
  });

  it("names the entered quantity that breaks a bound", () => {
    expect(outOfRangeInputs(separateSlot({ tdb: 9 }), pmvIso)).toEqual([q.tdb]);
    expect(outOfRangeInputs(separateSlot({ clo: 2.5 }), pmvIso)).toEqual([q.clo]);
  });

  it("checks an operative entry against every temperature it replaces", () => {
    const bound = enteredBound(pmvIso, q.operative_tmp, temperatureMode.operative);
    expect(bound?.max).toBe(pmvIso.info.inputs.tdb?.applicability?.max);
    expect(outOfRangeInputs(operativeSlot((bound?.max ?? 0) + 1), pmvIso)).toEqual([q.operative_tmp]);
    expect(outOfRangeInputs(operativeSlot(bound?.max ?? 0), pmvIso)).toEqual([]);
  });

  it("has no bound for a quantity the standard does not limit", () => {
    expect(enteredBound(pmvIso, q.rh, temperatureMode.separate)).toBeUndefined();
  });

  it("handles a min-only bound without a max (e.g. Heat Index's tdb)", () => {
    const minOnly = {
      ...pmvIso,
      info: { ...pmvIso.info, inputs: { ...pmvIso.info.inputs, tdb: { unit: "°C", applicability: { min: 15 } } } },
    };
    expect(enteredBound(minOnly, q.tdb, temperatureMode.separate)).toEqual({ min: 15 });
    expect(outOfRangeInputs(separateSlot({ tdb: 10 }), minOnly)).toEqual([q.tdb]);
    expect(outOfRangeInputs(separateSlot({ tdb: 1000 }), minOnly)).toEqual([]);
  });

  it("does not gate a value only a derived row bounds", () => {
    // tdb at the ISO bound, rh 95: no entered value breaks a row; the derived vapour pressure does.
    const slot = separateSlot({ tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    expect(outOfRangeInputs(humid, pmvIso)).toEqual([]);
  });
});

describe("derivedViolations", () => {
  it("is empty for a slot within every derived and vr bound", () => {
    expect(derivedViolations(separateSlot(), pmvIso)).toEqual([]);
  });

  it("reports the derived vapour pressure on the pa row", () => {
    const slot = separateSlot({ tdb: 30, tr: 30 });
    const humid: SlotInputs = { ...slot, humidity: { mode: humidityMode.rh, value: 95 } };
    const violation = derivedViolations(humid, pmvIso).find((row) => row.quantity === q.pa);
    expect(violation).toBeDefined();
    expect(violation?.role).toBe("derived");
    expect(violation?.value).toBe(vapourPressure(30, 95));
    expect(violation?.bound).toEqual(pmvIso.info.derived?.pa?.applicability);
  });

  it("reports a relative air speed that breaks the vr bound on the v row, without gating it", () => {
    const slot = separateSlot({ v: 1.5 });
    const violation = derivedViolations(slot, pmvIso).find((row) => row.quantity === q.v);
    expect(violation).toBeDefined();
    expect(violation?.role).toBe("input");
    expect(violation?.bound).toEqual(pmvIso.info.inputs.vr?.applicability);
    expect(outOfRangeInputs(slot, pmvIso)).toEqual([]);
  });
});

describe("outputViolations", () => {
  it("is empty when the model's outputs are within bounds", () => {
    const outcome = pmvIso.run(toLibraryInputs(separateSlot(), pmvIso));
    expect(outputViolations(pmvIso, outcome)).toEqual([]);
  });

  it("reports a bounded output that a run breaks", () => {
    const slot = separateSlot({ tdb: 5, tr: 5, v: 0.1, clo: 0.1 });
    const outcome = pmvIso.run(toLibraryInputs(slot, pmvIso));
    const violation = outputViolations(pmvIso, outcome).find((row) => row.quantity === q.pmv);
    const pmvBound = pmvIso.info.outputs.pmv?.applicability;
    expect(violation).toBeDefined();
    expect(violation?.role).toBe("output");
    expect(pmvBound?.max).toBeDefined();
    expect(Math.abs(violation!.value)).toBeGreaterThan(pmvBound!.max!);
  });
});

describe("the 2700 Pa vapour-pressure bound", () => {
  // ADR-0002 decision 4's revert path: the app's own `pa = rh / 100 × p_sat(tdb)`
  // must cross the ISO 7730 bound at the same relative humidity the kernel
  // itself flips to NaN at, within 0.1 % RH — otherwise the derived row cannot
  // be trusted and decision 4 reverts to waiting for #199.
  const paBound = pmvIso.info.derived?.pa?.applicability;
  if (!paBound?.max) {
    throw new Error("ISO 7730 no longer bounds the derived vapour pressure — decision 4 needs revisiting");
  }
  const paMax = paBound.max;

  // "Mid-range" here means a clo/met/vr combination (tr tracking tdb) chosen
  // so PMV itself stays within ±2 across the whole 0–100 % RH sweep at all
  // three temperatures: the arithmetic midpoint of met's own bound alone
  // runs to 4 (vigorous exercise), which pushes PMV past ±2 before pa reaches
  // 2700 Pa and makes the kernel's first NaN a PMV-bound flip, not a
  // vapour-pressure one — the wrong crossing for this test to pin.
  const vrMid = 0.15;
  const metMid = 1.4;
  const cloMid = 0.3;

  // Below roughly 22.3 °C, `p_sat(tdb)` itself is under 2700 Pa, so pa cannot
  // reach the bound at any humidity: 20 °C exercises that no-crossing case,
  // where both sides must agree there is none, rather than a numeric one.
  it.each([20, 25, 30])("agrees with the kernel's NaN flip within 0.1 RH at tdb=%d°C", (tdb) => {
    const appRh = bisect(0, 100, (rh) => vapourPressure(tdb, rh), 1e-6, paMax);
    const kernelFlipsToNaN = (rh: number): number => {
      const { pmv } = pmv_ppd_iso(tdb, tdb, vrMid, rh, metMid, cloMid, 0, Standard.iso_7730_2005, {
        limit_inputs: true,
      });
      return Number.isNaN(pmv) ? 1 : 0;
    };
    const kernelRh = bisect(0, 100, kernelFlipsToNaN, 1e-6, 0.5);
    expect(Math.abs(appRh - kernelRh)).toBeLessThan(0.1);
  });
});
