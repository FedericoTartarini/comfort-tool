import { describe, expect, it } from "vitest";
import { PMV_COMPLIANCE_INTERVAL_ASHRAE, pmv_ppd_iso, psy_ta_rh, Standard, v_relative } from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import { intervalZone } from "$lib/core/comfortZones";
import { humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { SlotInputs } from "$lib/core/libraryInputs";
import { psychrometricChartOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { quantities, type Quantity } from "$lib/core/quantities";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { pmv_psychrometric_zone } from "$lib/temporary-library/pmv_psychrometric_zone";
import { copy } from "$lib/text/copy";
import type { ChartRequest, PathTrace, PointTrace } from "./chartSpec";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;
const ZONE_RH_STEP = 5;
/** The library solves the edges to a PMV residual of 0.001 (ADR §4.7), so two decimals is loose. */
const PMV_DIGITS = 2;

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
  return { values, humidity: { mode: humidityMode.rh, value: 50 }, temperature: { mode }, options: new Map() };
}

function request(
  mode: typeof temperatureMode.separate | typeof temperatureMode.operative,
  system: UnitSystem = unitSystem.si,
): ChartRequest {
  return { model: pmvPpdIso, slot: slot(mode), slotLabel: "Input 1", unitSystem: system };
}

/** The ISO declaration's zones, largest first: the order the chart draws them in. */
function isoZonesLargestFirst() {
  const chart = psychrometricChartOf(pmvPpdIso);
  if (!chart) {
    throw new Error("PMV (ISO 7730) declares no psychrometric chart");
  }
  return [...chart.zones].sort((a, b) => b.limit - a.limit);
}

/** The zone outlines: the filled paths in the spec, in drawing order. */
function zonePaths(spec: { traces: readonly unknown[] }): PathTrace[] {
  return (spec.traces as PathTrace[]).filter((trace) => trace.kind === "path" && trace.fill !== undefined);
}

/**
 * Each polygon opens with the cool edge, one vertex per `ZONE_RH_STEP` of
 * relative humidity, so vertex `i` was solved at `rh = 5i` for `PMV = -limit`.
 * Feeding each one back through the model is what proves the app handed the
 * library the same inputs the result table uses — `vr` derived with
 * `v_relative`, `tr` from the entry mode.
 */
function pmvAt(db: number, rh: number, tr: number): number {
  // `round_output: false`, as the library's solver calls it: the rounded PMV is
  // a staircase of 0.01 steps, which is a plateau about 0.03 °C wide and would
  // put a root anywhere inside it.
  return pmv_ppd_iso({
    tdb: db,
    tr,
    vr: v_relative(v, met),
    rh,
    met,
    clo,
    wme: 0,
    standard: Standard.iso_7730_2005,
    limit_inputs: false,
    round_output: false,
  }).pmv;
}

describe("psychrometricSpec", () => {
  it("draws one zone per declared limit, largest first, each with its own fill", () => {
    const zones = isoZonesLargestFirst();
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate)));
    expect(zones).toHaveLength(3);
    expect(paths.map((path) => path.label)).toEqual(zones.map((zone) => copy.zoneLegend(zone)));
    expect(new Set(paths.map((path) => path.fill)).size).toBe(3);
  });

  it("solves each zone's cool edge at PMV = -limit for the slot's own inputs", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate)));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
        const rh = index * ZONE_RH_STEP;
        expect(pmvAt(paths[zoneIndex].x[index], rh, 24)).toBeCloseTo(-zone.limit, PMV_DIGITS);
      }
    });
  });

  it("draws each zone as the solver's own polygon at that zone's limit, top edge included", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate)));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      const { polygon } = pmv_psychrometric_zone({
        tr: 24,
        vr: v_relative(v, met),
        met,
        clo,
        pmv_function: (db, tr, _vr, rh) => pmvAt(db, rh, tr),
        pmv_limit: zone.limit,
        rh_step: ZONE_RH_STEP,
      });
      expect(paths[zoneIndex].x).toEqual(polygon.map((point) => point.db));
      expect(paths[zoneIndex].y).toEqual(polygon.map((point) => point.hr));
    });
  });

  it("solves with tr following the dry-bulb temperature under operative entry", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.operative)));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
        const db = paths[zoneIndex].x[index];
        expect(pmvAt(db, index * ZONE_RH_STEP, db)).toBeCloseTo(-zone.limit, PMV_DIGITS);
      }
    });
  });

  it("draws a one-zone declaration as one zone", () => {
    const zone = intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE);
    const oneZone: RegisteredModel = {
      ...pmvPpdIso,
      charts: [{ type: chartType.psychrometric, zones: [zone] }],
    };
    const spec = psychrometricSpec({ ...request(temperatureMode.separate), model: oneZone });
    expect(zonePaths(spec).map((path) => path.label)).toEqual([copy.zoneLegend(zone)]);
    expect(spec.legend.map((entry) => entry.swatch)).toEqual(["line", "fill", "marker"]);
  });

  it("labels the x axis with the entry mode's temperature quantity", () => {
    expect(psychrometricSpec(request(temperatureMode.separate)).layout.x.title).toContain(q.tdb.label);
    expect(psychrometricSpec(request(temperatureMode.operative)).layout.x.title).toContain(q.operative_tmp.label);
  });

  it("marks the slot's own psychrometric state", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate));
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBe(26);
    expect(marker?.y).toBeCloseTo(psy_ta_rh(26, 50).hr, 12);
  });

  it("converts the axes to the displayed unit", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate, unitSystem.ip));
    expect(spec.layout.x.title).toContain("°F");
    // The declared viewport is 10–40 °C, as the deployed tool draws it.
    expect(spec.layout.x.range[0]).toBeCloseTo(50, 10);
    expect(spec.layout.x.range[1]).toBeCloseTo(104, 10);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBeCloseTo(78.8, 10);
  });

  it("labels every relative-humidity isoline where it leaves the viewport", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate));
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
    const spec = psychrometricSpec(request(temperatureMode.separate));
    expect(spec.traces.every((trace) => trace.hover === "off")).toBe(true);
  });

  it("refuses a model whose result carries no PMV", () => {
    // The zone is traced on `run`'s own PMV, so a model without one cannot
    // declare this chart.
    const outputs = Object.fromEntries(Object.entries(pmvPpdIso.info.outputs).filter(([key]) => key !== q.pmv.key));
    const withoutPmv: RegisteredModel = { ...pmvPpdIso, info: { ...pmvPpdIso.info, outputs } };
    expect(() => psychrometricSpec({ ...request(temperatureMode.separate), model: withoutPmv })).toThrow(q.pmv.label);
  });

  it("offers one legend covering humidity, each zone and the slot", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate));
    expect(spec.legend.map((entry) => entry.swatch)).toEqual(["line", "fill", "fill", "fill", "marker"]);
    expect(spec.legend[0].label).toBe(q.rh.label);
    expect(spec.legend.slice(1, 4).map((entry) => entry.label)).toEqual(
      isoZonesLargestFirst().map((zone) => copy.zoneLegend(zone)),
    );
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
  it("sit within 0.01 °C of an independently bisected root, for every zone", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate)));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
        const rh = index * ZONE_RH_STEP;
        expect(Math.abs(paths[zoneIndex].x[index] - bisectPmv(-zone.limit, rh, 24))).toBeLessThanOrEqual(0.01);
      }
    });
  });

  it("does so under operative entry too", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.operative)));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
        const rh = index * ZONE_RH_STEP;
        expect(Math.abs(paths[zoneIndex].x[index] - bisectPmv(-zone.limit, rh, "followsDb"))).toBeLessThanOrEqual(
          0.01,
        );
      }
    });
  });
});
