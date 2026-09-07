import { describe, expect, it } from "vitest";
import { io, v_relative } from "jsthermalcomfort";
import type { Quantity } from "jsthermalcomfort/io";
import { psy_ta_rh } from "jsthermalcomfort/psychrometrics";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { SlotInputs } from "$lib/core/libraryInputs";
import { psychrometricChartOf } from "$lib/core/modelDeclaration";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import { pmvIso } from "$lib/models/pmvIso";
import type { ChartRequest, PathTrace, PointTrace } from "./chartSpec";
import { psychrometricSpec } from "./psychrometricChart";

const q = io.quantities;
const ZONE_RH_STEP = 5;
/** The library solves the edges to a PMV residual of 0.001 (ADR §4.7), so two decimals is loose. */
const PMV_DIGITS = 2;

const declaration = psychrometricChartOf(pmvIso);
if (!declaration) {
  throw new Error("pmvIso no longer declares a psychrometric chart");
}

const met = 1.1;
const clo = 0.5;
const v = 0.1;

function slot(mode: typeof temperatureMode.separate | typeof temperatureMode.operative): SlotInputs {
  const values = new Map<Quantity, number>([
    [q.v, v],
    [q.met, met],
    [q.clo, clo],
  ]);
  if (mode === temperatureMode.operative) {
    values.set(q.operative_tmp, 25);
  } else {
    values.set(q.tdb, 26);
    values.set(q.tr, 24);
  }
  return { values, humidity: { mode: humidityMode.rh, value: 50 }, temperature: { mode } };
}

function request(
  mode: typeof temperatureMode.separate | typeof temperatureMode.operative,
  system: UnitSystem = unitSystem.si,
): ChartRequest {
  return { model: pmvIso, slot: slot(mode), slotLabel: "Input 1", unitSystem: system };
}

/** The zone outline: the one filled path in the spec. */
function zonePath(spec: { traces: readonly unknown[] }): PathTrace {
  const path = (spec.traces as PathTrace[]).find((trace) => trace.kind === "path" && trace.fill !== undefined);
  if (!path) {
    throw new Error("spec has no filled zone path");
  }
  return path;
}

/**
 * The polygon opens with the cool edge, one vertex per `ZONE_RH_STEP` of
 * relative humidity, so vertex `i` was solved at `rh = 5i` for `PMV = -0.5`.
 * Feeding each one back through the model is what proves the app handed the
 * library the same inputs the result table uses — `vr` derived with
 * `v_relative`, `tr` from the entry mode.
 */
function pmvAt(db: number, rh: number, tr: number): number {
  // `round_output: false`, as the library's solver calls it: the rounded PMV is
  // a staircase of 0.01 steps, which is a plateau about 0.03 °C wide and would
  // put a root anywhere inside it.
  return io.pmvPpdIso({
    tdb: db,
    tr,
    vr: v_relative(v, met),
    rh,
    met,
    clo,
    units: "SI",
    limit_inputs: false,
    round_output: false,
  }).result.pmv;
}

describe("psychrometricSpec", () => {
  it("solves the cool edge at PMV = -0.5 for the slot's own inputs", () => {
    const path = zonePath(psychrometricSpec(request(temperatureMode.separate), declaration));
    for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
      const rh = index * ZONE_RH_STEP;
      expect(pmvAt(path.x[index], rh, 24)).toBeCloseTo(-0.5, PMV_DIGITS);
    }
  });

  it("solves with tr following the dry-bulb temperature under operative entry", () => {
    const path = zonePath(psychrometricSpec(request(temperatureMode.operative), declaration));
    for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
      const db = path.x[index];
      expect(pmvAt(db, index * ZONE_RH_STEP, db)).toBeCloseTo(-0.5, PMV_DIGITS);
    }
  });

  it("labels the x axis with the entry mode's temperature quantity", () => {
    expect(psychrometricSpec(request(temperatureMode.separate), declaration).layout.x.title).toContain(q.tdb.label);
    expect(psychrometricSpec(request(temperatureMode.operative), declaration).layout.x.title).toContain(q.operative_tmp.label);
  });

  it("marks the slot's own psychrometric state", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), declaration);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBe(26);
    expect(marker?.y).toBeCloseTo(psy_ta_rh(26, 50).hr, 12);
  });

  it("converts the axes to the displayed unit", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate, unitSystem.ip), declaration);
    expect(spec.layout.x.title).toContain("°F");
    // The declared viewport is 10–40 °C, as the deployed tool draws it.
    expect(spec.layout.x.range[0]).toBeCloseTo(50, 10);
    expect(spec.layout.x.range[1]).toBeCloseTo(104, 10);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBeCloseTo(78.8, 10);
  });

  it("labels every relative-humidity isoline where it leaves the viewport", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), declaration);
    expect(spec.annotations.map((entry) => entry.text)).toEqual([
      "10%",
      "20%",
      "30%",
      "40%",
      "50%",
      "60%",
      "70%",
      "80%",
      "90%",
      "100%",
    ]);
    for (const entry of spec.annotations) {
      expect(entry.x).toBeGreaterThanOrEqual(10);
      expect(entry.x).toBeLessThanOrEqual(40);
      expect(entry.y).toBeLessThanOrEqual(0.03);
    }
  });

  it("leaves the pointer alone: nothing on this chart captures hover", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), declaration);
    expect(spec.traces.every((trace) => trace.hover === "off")).toBe(true);
  });

  it("offers one legend covering humidity, the zone and the slot", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), declaration);
    expect(spec.legend.map((entry) => entry.swatch)).toEqual(["line", "fill", "marker"]);
    expect(spec.legend[0].label).toBe(q.rh.label);
  });
});

/**
 * An independent oracle for the done criterion "the comfort-zone vertices
 * differ by ≤ 0.01 °C". Plain bisection on temperature, written here rather
 * than taken from the library, so it agrees with the library's secant solver
 * only if both are solving the same equation with the same inputs. A root
 * found in temperature space is what the criterion is stated in; the app's
 * source never contains a root finder (ADR §4.7).
 */
function bisectPmv(target: number, rh: number, tr: number | "followsDb"): number {
  let low = 10;
  let high = 40;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    const value = pmvAt(middle, rh, tr === "followsDb" ? middle : tr);
    if (value < target) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

describe("comfort-zone vertices", () => {
  it("sit within 0.01 °C of an independently bisected root", () => {
    const path = zonePath(psychrometricSpec(request(temperatureMode.separate), declaration));
    for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
      const rh = index * ZONE_RH_STEP;
      expect(Math.abs(path.x[index] - bisectPmv(-0.5, rh, 24))).toBeLessThanOrEqual(0.01);
    }
  });

  it("does so under operative entry too", () => {
    const path = zonePath(psychrometricSpec(request(temperatureMode.operative), declaration));
    for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
      const rh = index * ZONE_RH_STEP;
      expect(Math.abs(path.x[index] - bisectPmv(-0.5, rh, "followsDb"))).toBeLessThanOrEqual(0.01);
    }
  });
});
