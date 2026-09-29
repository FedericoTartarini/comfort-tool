import { describe, expect, it } from "vitest";
import { PMV_COMPLIANCE_INTERVAL_ASHRAE, pmv_ppd_iso, psy_ta_rh, v_relative } from "jsthermalcomfort";
import { chartType } from "$lib/core/chartType";
import { intervalZone } from "$lib/core/comfortZones";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { temperatureMode } from "$lib/core/entryModes";
import { valuesReader } from "$lib/core/libraryInputs";
import { psychrometricChartOf, type DeclaredPsychrometricChart, type RegisteredModel } from "$lib/core/modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { startingSlot, type Slot } from "$lib/core/slot";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { pmv_psychrometric_zone, type PmvFunction } from "$lib/temporary-library/pmv_psychrometric_zone";
import { copy } from "$lib/text/copy";
import type { ChartRequest, PathTrace, PointTrace, Trace } from "./chartSpec";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;
/** Humidity ratio as the SI chart draws it, in g/kg. */
const hrUnit = displayUnitFor(q.hr, unitSystem.si);
const ZONE_RH_STEP = 5;
/** The temporary library solves the boundaries to a PMV residual of 0.001 (ADR §4.7), so two decimals is loose. */
const PMV_DIGITS = 2;

/** The ISO declaration's own met, clo and v, which every slot below keeps. */
const { met, clo, v } = valuesReader(startingSlot(pmvPpdIso).values);

function slot(mode: typeof temperatureMode.separate | typeof temperatureMode.operative): Slot {
  return mode === temperatureMode.operative
    ? enteredSlotFor(pmvPpdIso, { operative_tmp: 25 })
    : enteredSlotFor(pmvPpdIso, { tdb: 26, tr: 24 });
}

function request(
  mode: typeof temperatureMode.separate | typeof temperatureMode.operative,
  system: UnitSystem = unitSystem.si,
): ChartRequest {
  return {
    model: pmvPpdIso,
    slot: slot(mode),
    slotLabel: "Input 1",
    unitSystem: system,
    atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE,
  };
}

/** The ISO declaration's psychrometric chart: what every spec below draws, unless a test hands it another. */
function isoPsychrometricChart(): DeclaredPsychrometricChart {
  const chart = psychrometricChartOf(pmvPpdIso);
  if (!chart) {
    throw new Error("PMV (ISO 7730) declares no psychrometric chart");
  }
  return chart;
}

const isoChart = isoPsychrometricChart();

/** The ISO declaration's zones, largest first: the order the chart draws them in. */
function isoZonesLargestFirst() {
  return [...isoChart.zones].sort((a, b) => b.limit - a.limit);
}

/** The zone outlines: the filled paths in the spec, in drawing order. */
function zonePaths(spec: { traces: readonly Trace[] }): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill !== undefined);
}

/**
 * Each polygon opens with the cool boundary, one vertex per `ZONE_RH_STEP` of
 * relative humidity, so vertex `i` was solved at `rh = 5i` for `PMV = -limit`.
 * Feeding each one back through the model is what proves the app handed the
 * temporary library the same inputs the result table uses — `vr` derived with
 * `v_relative`, `tr` from the entry mode.
 */
function pmvAt(db: number, rh: number, tr: number): number {
  // `round_output: false`, as the temporary library's solver calls it: the
  // rounded PMV is a staircase of 0.01 steps, which is a plateau about 0.03 °C
  // wide and would put a root anywhere inside it.
  return pmv_ppd_iso({
    tdb: db,
    tr,
    vr: v_relative(v, met),
    rh,
    met,
    clo,
    wme: 0,
    standard: pmvPpdIso.standard,
    limit_inputs: false,
    round_output: false,
  }).pmv;
}

/**
 * The solver's own zone at `limit` for the separate-entry slot's inputs, as the
 * chart should hand them over: `tr` 24, `vr` derived with `v_relative`.
 */
function solvedZone(limit: number, pmv_function: PmvFunction) {
  return pmv_psychrometric_zone({
    tr: 24,
    vr: v_relative(v, met),
    met,
    clo,
    pmv_function,
    pmv_limit: limit,
    rh_step: ZONE_RH_STEP,
  });
}

describe("psychrometricSpec", () => {
  it("draws one zone per declared limit, largest first, each with its own fill", () => {
    const zones = isoZonesLargestFirst();
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate), isoChart));
    expect(zones).toHaveLength(3);
    expect(paths.map((path) => path.label)).toEqual(zones.map((zone) => copy.zoneLegend(zone)));
    expect(new Set(paths.map((path) => path.fill)).size).toBe(3);
  });

  it("solves each zone's cool boundary at PMV = -limit for the slot's own inputs", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate), isoChart));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
        const rh = index * ZONE_RH_STEP;
        expect(pmvAt(paths[zoneIndex].x[index], rh, 24)).toBeCloseTo(-zone.limit, PMV_DIGITS);
      }
    });
  });

  it("draws each zone as the solver's own polygon at that zone's limit, saturation line included", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate), isoChart));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      const { polygon } = solvedZone(zone.limit, (db, tr, _vr, rh) => pmvAt(db, rh, tr));
      expect(paths[zoneIndex].x).toEqual(polygon.map((point) => point.tdb));
      expect(paths[zoneIndex].y).toEqual(polygon.map((point) => hrUnit.fromSi(point.hr)));
    });
  });

  it("drops the points the solver could not solve by a finite check alone", () => {
    // Below `FLAT_BELOW_RH` the PMV never moves, so the rows at 0 and 5 % have
    // no root on either boundary: four unsolved points per zone.
    const FLAT_BELOW_RH = 10;
    const flatWhenDry: RegisteredModel = {
      ...pmvPpdIso,
      run: (values) => ({ ...pmvPpdIso.run(values), ...(values.rh < FLAT_BELOW_RH ? { pmv: 0 } : {}) }),
    };
    const paths = zonePaths(psychrometricSpec({ ...request(temperatureMode.separate), model: flatWhenDry }, isoChart));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      const { polygon, unsolved } = solvedZone(zone.limit, (db, tr, _vr, rh) =>
        rh < FLAT_BELOW_RH ? 0 : pmvAt(db, rh, tr),
      );
      expect(unsolved).toHaveLength(4);
      const solved = polygon.filter((point) => Number.isFinite(point.tdb));
      expect(solved).toHaveLength(polygon.length - 4);
      expect(paths[zoneIndex].x).toEqual(solved.map((point) => point.tdb));
      expect(paths[zoneIndex].y).toEqual(solved.map((point) => hrUnit.fromSi(point.hr)));
    });
  });

  it("solves with tr following the dry-bulb temperature under operative entry", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.operative), isoChart));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
        const db = paths[zoneIndex].x[index];
        expect(pmvAt(db, index * ZONE_RH_STEP, db)).toBeCloseTo(-zone.limit, PMV_DIGITS);
      }
    });
  });

  it("draws the chart it is handed, a one-zone one as one zone", () => {
    const zone = intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE);
    const spec = psychrometricSpec(request(temperatureMode.separate), { type: chartType.psychrometric, zones: [zone] });
    expect(zonePaths(spec).map((path) => path.label)).toEqual([copy.zoneLegend(zone)]);
    expect(spec.legend.map((entry) => entry.swatch)).toEqual(["line", "fill", "marker"]);
  });

  it("names the zones drawn today by their limit, word for word", () => {
    const zoneLabels = (model: RegisteredModel) => {
      const chart = psychrometricChartOf(model);
      if (!chart) {
        throw new Error(`${model.info.name} declares no psychrometric chart`);
      }
      const spec = psychrometricSpec({ ...request(temperatureMode.separate), model, slot: startingSlot(model) }, chart);
      return zonePaths(spec).map((path) => path.label);
    };
    expect(zoneLabels(pmvPpdIso)).toEqual([
      "Category C (|PMV| < 0.7)",
      "Category B (|PMV| < 0.5)",
      "Category A (|PMV| < 0.2)",
    ]);
    expect(zoneLabels(pmvPpdAshrae)).toEqual(["Comfort zone (|PMV| < 0.5)"]);
  });

  it("writes a zone's limit as every number on screen is written", () => {
    const zone = { label: copy.comfortZone, limit: 1 / 3, inclusive: true };
    const spec = psychrometricSpec(request(temperatureMode.separate), { type: chartType.psychrometric, zones: [zone] });
    expect(zonePaths(spec).map((path) => path.label)).toEqual(["Comfort zone (|PMV| ≤ 0.33)"]);
  });

  it("labels the x axis with the entry mode's temperature quantity", () => {
    expect(psychrometricSpec(request(temperatureMode.separate), isoChart).layout.x.title).toContain(q.tdb.label);
    expect(psychrometricSpec(request(temperatureMode.operative), isoChart).layout.x.title).toContain(
      q.operative_tmp.label,
    );
  });

  it("marks the slot's own psychrometric state", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), isoChart);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBe(26);
    expect(marker?.y).toBeCloseTo(hrUnit.fromSi(psy_ta_rh(26, 50).hr), 12);
  });

  it("converts the axes to the displayed unit", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate, unitSystem.ip), isoChart);
    expect(spec.layout.x.title).toContain("°F");
    // The declared viewport is 10–40 °C, as the deployed tool draws it.
    expect(spec.layout.x.range[0]).toBeCloseTo(50, 10);
    expect(spec.layout.x.range[1]).toBeCloseTo(104, 10);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBeCloseTo(78.8, 10);
  });

  it("draws humidity ratio per thousand, 0 to 30, with no tick format of its own", () => {
    expect(psychrometricSpec(request(temperatureMode.separate), isoChart).layout.y).toEqual({
      title: "Humidity ratio (g/kg)",
      range: [0, 30],
    });
    expect(psychrometricSpec(request(temperatureMode.separate, unitSystem.ip), isoChart).layout.y).toEqual({
      title: "Humidity ratio (lb/klb)",
      range: [0, 30],
    });
  });

  it("labels every relative-humidity isoline where it leaves the viewport", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), isoChart);
    expect(spec.annotations.map((entry) => entry.text)).toEqual([
      "10 %",
      "20 %",
      "30 %",
      "40 %",
      "50 %",
      "60 %",
      "70 %",
      "80 %",
      "90 %",
      "100 %",
    ]);
    for (const entry of spec.annotations) {
      expect(entry.x).toBeGreaterThanOrEqual(10);
      expect(entry.x).toBeLessThanOrEqual(40);
      expect(entry.y).toBeLessThanOrEqual(30);
    }
  });

  it("names each isoline by its relative humidity, spelled as the results table spells a percentage", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), isoChart);
    const isolines = spec.traces.filter(
      (trace): trace is PathTrace => trace.kind === "path" && Boolean(trace.label?.startsWith(q.rh.label)),
    );
    expect(isolines.map((trace) => trace.label)).toEqual(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((rh) => `${q.rh.label} ${rh} %`),
    );
  });

  it("leaves the pointer alone: nothing on this chart captures hover", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), isoChart);
    expect(spec.traces.every((trace) => trace.hover === "off")).toBe(true);
  });

  it("offers one legend covering humidity, each zone and the slot", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate), isoChart);
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
 * than taken from the temporary library, so it agrees with that library's
 * secant solver only if both are solving the same equation with the same
 * inputs. A root found in temperature space is what the criterion is stated in.
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
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.separate), isoChart));
    isoZonesLargestFirst().forEach((zone, zoneIndex) => {
      for (let index = 0; index * ZONE_RH_STEP <= 100; index += 1) {
        const rh = index * ZONE_RH_STEP;
        expect(Math.abs(paths[zoneIndex].x[index] - bisectPmv(-zone.limit, rh, 24))).toBeLessThanOrEqual(0.01);
      }
    });
  });

  it("does so under operative entry too", () => {
    const paths = zonePaths(psychrometricSpec(request(temperatureMode.operative), isoChart));
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
