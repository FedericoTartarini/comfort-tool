/**
 * The psychrometric chart given no Band list, as the Standard page asks for
 * it: each slot's Comfort zones as contours of its own scan over the
 * temperature axis and the humidity ratio (ADR-0002 decision 61), under the
 * cover above saturation, the isolines and the markers, and a hover grid
 * reading every slot's number. Handed a list it paints Bands
 * (`psychrometricChartBands.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { clo_dynamic_iso, hr_to_rh, PMV_COMPLIANCE_INTERVAL_ASHRAE, pmv_ppd_iso, psy_ta_rh, v_relative } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import { bandListOf } from "$lib/core/bands";
import { intervalZone } from "$lib/core/comfortZones";
import { enteredSlotFor } from "$lib/core/declarationTestSlots";
import { temperatureMode } from "$lib/core/entryModes";
import { valuesReader } from "$lib/core/libraryInputs";
import type { ComfortZone, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, type Slot } from "$lib/core/slot";
import { slotBadges } from "$lib/core/slotBadge";
import { displayUnitFor, numberWithUnit } from "$lib/core/units";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { ChartSpec, ContourZoneTrace, HoverGridTrace, PathTrace, PointTrace } from "./chartSpec";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;
const p = DEFAULT_ATMOSPHERIC_PRESSURE;
/** Humidity ratio as the SI chart draws it, in g/kg. */
const hrUnit = displayUnitFor(q.hr, unitSystem.si);
/** A cell's number is compared at the precision the readout shows it. */
const PMV_DIGITS = 2;

/** The ISO declaration's own met, clothing insulation and v, which every slot below keeps. */
const { met, clo: clothingInsulation, v } = valuesReader(startingSlot(pmvPpdIso).values);
/** The dynamic clothing insulation the model is given for it: ISO 7730's rule, by the library. */
const clo = clo_dynamic_iso(clothingInsulation, met, v);

function slot(mode: typeof temperatureMode.separate | typeof temperatureMode.operative): Slot {
  return mode === temperatureMode.operative
    ? enteredSlotFor(pmvPpdIso, { operative_tmp: 25 })
    : enteredSlotFor(pmvPpdIso, { tdb: 26, tr: 24 });
}

function request(
  mode: typeof temperatureMode.separate | typeof temperatureMode.operative,
  system: UnitSystem = unitSystem.si,
): ChartRequest {
  return chartRequestFor(pmvPpdIso, slot(mode), system);
}

/** The ISO declaration's zones, largest first: the order the chart draws them in. */
function isoZonesLargestFirst() {
  return [...pmvPpdIso.scan.comfortZones].sort((a, b) => b.limit - a.limit);
}

/** {@link request} under separate entry, of the ISO declaration with `zones` in its scan instead of its own. */
function requestWithZones(zones: readonly [ComfortZone, ...ComfortZone[]]): ChartRequest {
  return { ...request(temperatureMode.separate), model: { ...pmvPpdIso, scan: { ...pmvPpdIso.scan, comfortZones: zones } } };
}

/** The Comfort zones, contours of a scan, in drawing order. */
function zonesOf(spec: ChartSpec): ContourZoneTrace[] {
  return spec.traces.filter((trace): trace is ContourZoneTrace => trace.kind === "contourZone");
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** The relative-humidity isolines: the unfilled paths, the saturation line the last. */
function isolinesOf(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && trace.fill === undefined);
}

/** The cover above the saturation line: the path filled in the plot's ground. */
function coverOf(spec: ChartSpec): PathTrace {
  const trace = spec.traces.find((entry): entry is PathTrace => entry.kind === "path" && entry.fill === chartInk.ground);
  if (!trace) {
    throw new Error("spec has no cover");
  }
  return trace;
}

function markersOf(spec: ChartSpec): PointTrace[] {
  return spec.traces.filter((trace): trace is PointTrace => trace.kind === "point");
}

/** Whether the cell of `zone` at (`xIndex`, `yIndex`) is supersaturated: its relative humidity above 100. */
function isSupersaturated(zone: ContourZoneTrace, xIndex: number, yIndex: number): boolean {
  return hr_to_rh(hrUnit.toSi(zone.y[yIndex]), zone.x[xIndex], p) > 100;
}

/**
 * The model's own number at the cell whose temperature axis reads
 * `temperature` and whose humidity ratio reads `hr`, both in SI: `slot` with
 * that temperature entered and the relative humidity the library gives for
 * `hr`.
 */
function numberAt(entered: Slot, temperature: number, hr: number): number {
  const cell = withEnteredValues(entered, new Map([
    [entered.temperature.mode.axis, temperature],
    [q.rh, hr_to_rh(hr, temperature, p)],
  ]));
  return resultNumber(runOn(cell, pmvPpdIso, p), q.pmv);
}

/**
 * ISO 7730's PMV called on the library directly, unrounded: an oracle that
 * agrees with a cell's number only if the app handed the model the inputs the
 * result table uses — `vr` derived with `v_relative`, `clo` corrected by
 * `clo_dynamic_iso`, `tr` from the entry mode.
 */
function pmvAt(db: number, rh: number, tr: number): number {
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

describe("psychrometricSpec", () => {
  const spec = psychrometricSpec(request(temperatureMode.separate));

  it("paints one contour zone per declared limit, largest first, over the slot's field, each with its limit as its interval", () => {
    const zones = isoZonesLargestFirst();
    const drawn = zonesOf(spec);
    expect(zones).toHaveLength(3);
    expect(drawn.map((zone) => [zone.label, zone.lower, zone.upper])).toEqual(
      zones.map((zone) => [copy.zoneLegend(zone), -zone.limit, zone.limit]),
    );
    expect(new Set(drawn.map((zone) => zone.z)).size).toBe(1);
  });

  it("fills them in the slot's hue, the opacity rising inwards, and traces no polygon", () => {
    const drawn = zonesOf(spec);
    expect(drawn.every((zone) => zone.color === slotBadges[0].hue.zoneLine)).toBe(true);
    expect(drawn.map((zone) => zone.fill)).toEqual(drawn.map((_, level) => chartInk.zoneFill(slotBadges[0].hue, level, 3)));
    expect(spec.traces.some((trace) => trace.kind === "path" && trace.fill !== undefined && trace.fill !== chartInk.ground)).toBe(false);
  });

  it("scans the drawn axes: the temperature axis and the humidity ratio, in display units", () => {
    const [zone] = zonesOf(spec);
    expect([zone.x[0], zone.x[zone.x.length - 1]]).toEqual(spec.layout.x.range);
    expect(zone.y[0]).toBe(spec.layout.y.range[0]);
    expect(zone.y[zone.y.length - 1]).toBeCloseTo(spec.layout.y.range[1], 2);
  });

  it("numbers a cell with the model's own output at its temperature and the library's relative humidity, the supersaturated ones too", () => {
    const [zone] = zonesOf(spec);
    // The last cell is supersaturated, run at its true relative humidity above 100.
    expect(isSupersaturated(zone, 0, 50)).toBe(true);
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40], [40, 50], [50, 0]]) {
      expect(zone.z[yIndex][xIndex]).toBe(numberAt(slot(temperatureMode.separate), zone.x[xIndex], hrUnit.toSi(zone.y[yIndex])));
    }
  });

  it("hands the model the slot's own inputs: tr as entered, vr derived, clothing corrected", () => {
    const [zone] = zonesOf(spec);
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40]]) {
      const db = zone.x[xIndex];
      expect(zone.z[yIndex][xIndex]).toBeCloseTo(pmvAt(db, hr_to_rh(hrUnit.toSi(zone.y[yIndex]), db, p), 24), PMV_DIGITS);
    }
  });

  it("scans the operative temperature under operative entry, with tr following it", () => {
    const drawn = psychrometricSpec(request(temperatureMode.operative));
    const [zone] = zonesOf(drawn);
    expect(drawn.layout.x.title).toContain(q.operative_tmp.label);
    expect(zonesOf(drawn)).toHaveLength(3);
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40]]) {
      const db = zone.x[xIndex];
      expect(zone.z[yIndex][xIndex]).toBeCloseTo(pmvAt(db, hr_to_rh(hrUnit.toSi(zone.y[yIndex]), db, p), db), PMV_DIGITS);
    }
  });

  it("empties only the cell where the model gives no number", () => {
    const noNumberWhenDry: RegisteredModel = {
      ...pmvPpdIso,
      run: (values) => ({ ...pmvPpdIso.run(values), ...(values.rh < 10 ? { pmv: Number.NaN } : {}) }),
    };
    const [zone] = zonesOf(psychrometricSpec({ ...request(temperatureMode.separate), model: noNumberWhenDry }));
    expect(zone.z[0][0]).toBeNull();
    expect(zone.z[20][25]).toBeTypeOf("number");
  });

  it("paints the scan it is handed rather than scanning again", () => {
    const handed = zonesOf(spec)[0].z.map((row) => row.map(() => 0.1));
    const drawn = psychrometricSpec(request(temperatureMode.separate), [handed]);
    expect(zonesOf(drawn).map((zone) => zone.z)).toEqual([handed, handed, handed]);
  });

  it("draws the zones, the hover grid, the cover, the isolines with the saturation line last, then the marker", () => {
    const isolines = isolinesOf(spec);
    expect(isolines).toHaveLength(10);
    expect(isolines[isolines.length - 1].color).toBe(chartInk.saturationLine);
    expect(spec.traces).toEqual([...zonesOf(spec), hoverGridOf(spec), coverOf(spec), ...isolines, ...markersOf(spec)]);
    expect(markersOf(spec)).toHaveLength(1);
  });

  it("covers the chart above the saturation line as it does given a Band list", () => {
    const banded = psychrometricSpec({ ...request(temperatureMode.separate), bands: bandListOf(pmvPpdIso.scan.classifier) });
    expect(coverOf(spec)).toEqual(coverOf(banded));
  });

  it("draws the zones of the model it is handed, a one-zone scan as one zone", () => {
    const zone = intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE);
    const drawn = psychrometricSpec(requestWithZones([zone]));
    expect(zonesOf(drawn).map((trace) => trace.label)).toEqual([copy.zoneLegend(zone)]);
    expect(drawn.legend.map((entry) => entry.swatch)).toEqual(["line", "fill", "marker"]);
  });

  it("names the zones drawn today by their limit, word for word", () => {
    const zoneLabels = (model: RegisteredModel) =>
      zonesOf(psychrometricSpec(chartRequestFor(model, startingSlot(model)))).map((zone) => zone.label);
    expect(zoneLabels(pmvPpdIso)).toEqual([
      "Category C (|PMV| < 0.7)",
      "Category B (|PMV| < 0.5)",
      "Category A (|PMV| < 0.2)",
    ]);
    expect(zoneLabels(pmvPpdAshrae)).toEqual(["Comfort zone (|PMV| < 0.5)"]);
  });

  it("writes a zone's limit as every number on screen is written", () => {
    const zone = { label: copy.comfortZone, limit: 1 / 3, inclusive: true };
    const drawn = psychrometricSpec(requestWithZones([zone]));
    expect(zonesOf(drawn).map((trace) => trace.label)).toEqual(["Comfort zone (|PMV| ≤ 0.33)"]);
  });

  it("labels the x axis with the entry mode's temperature quantity", () => {
    expect(psychrometricSpec(request(temperatureMode.separate)).layout.x.title).toContain(q.tdb.label);
    expect(psychrometricSpec(request(temperatureMode.operative)).layout.x.title).toContain(
      q.operative_tmp.label,
    );
  });

  it("marks the slot's own psychrometric state", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate));
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBe(26);
    expect(marker?.y).toBeCloseTo(hrUnit.fromSi(psy_ta_rh(26, 50).hr), 12);
  });

  it("converts the axes to the displayed unit", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate, unitSystem.ip));
    expect(spec.layout.x.title).toContain("°F");
    // The declared viewport is 10–40 °C, as the deployed tool draws it.
    expect(spec.layout.x.range[0]).toBeCloseTo(50, 10);
    expect(spec.layout.x.range[1]).toBeCloseTo(104, 10);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBeCloseTo(78.8, 10);
    // The zones over the same scan as in SI, on axes in °F and lb/klb.
    const [zone] = zonesOf(spec);
    expect(zone.x[0]).toBeCloseTo(50, 2);
    expect(zone.z).toEqual(zonesOf(psychrometricSpec(request(temperatureMode.separate)))[0].z);
  });

  it("draws humidity ratio per thousand, 0 to 30, with no tick format of its own", () => {
    expect(psychrometricSpec(request(temperatureMode.separate)).layout.y).toEqual({
      title: "Humidity ratio (g/kg)",
      range: [0, 30],
    });
    expect(psychrometricSpec(request(temperatureMode.separate, unitSystem.ip)).layout.y).toEqual({
      title: "Humidity ratio (lb/klb)",
      range: [0, 30],
    });
  });

  it("labels every relative-humidity isoline where it leaves the viewport", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate));
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
    const spec = psychrometricSpec(request(temperatureMode.separate));
    const isolines = spec.traces.filter(
      (trace): trace is PathTrace => trace.kind === "path" && Boolean(trace.label?.startsWith(q.rh.label)),
    );
    expect(isolines.map((trace) => trace.label)).toEqual(
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((rh) => `${q.rh.label} ${rh} %`),
    );
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

describe("the psychrometric chart's hover readout on the Standard page", () => {
  const spec = psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)));
  const { hoverText } = hoverGridOf(spec);
  const [zone] = zonesOf(spec);
  const pmvUnit = displayUnitFor(q.pmv, unitSystem.si);

  it("is read off the hover grid alone", () => {
    expect(spec.traces.filter((trace) => trace.hover !== "off").map((trace) => trace.kind)).toEqual(["hoverGrid"]);
  });

  it("reads the temperature, the humidity ratio and the slot's number, no relative humidity and no zone name", () => {
    // Cell (row 10, column 25) at PMV (ISO 7730)'s defaults: 25 °C, 6 g/kg, about 30 %.
    expect(hoverText[10][25]).toEqual([
      "Dry-bulb air temperature: 25 °C",
      "Humidity ratio: 6 g/kg",
      "Predicted Mean Vote: -0.56",
    ]);
    expect(new Set(hoverText.flat().map((readout) => readout.length))).toEqual(new Set([3]));
  });

  it("reads the cell's own number in every cell below saturation, and \"—\" above it, where the cell still carries one", () => {
    zone.z.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const expected = isSupersaturated(zone, xIndex, yIndex) ? Number.NaN : (value ?? Number.NaN);
        expect(hoverText[yIndex][xIndex][2]).toBe(`${q.pmv.label}: ${numberWithUnit(expected, pmvUnit)}`);
      }),
    );
    expect(zone.z[zone.z.length - 1][0]).toBeTypeOf("number");
    expect(hoverText[zone.z.length - 1][0][2]).toBe(`${q.pmv.label}: ${copy.notAvailable}`);
  });

  it("reads under operative entry the operative temperature", () => {
    const operative = hoverGridOf(psychrometricSpec(request(temperatureMode.operative)));
    expect(operative.hoverText[10][25][0]).toBe(`${q.operative_tmp.label}: 25 °C`);
  });

  it("reads in IP units in IP", () => {
    const ip = hoverGridOf(psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso), unitSystem.ip)));
    expect(ip.hoverText[10][25].slice(0, 2)).toEqual(["Dry-bulb air temperature: 77 °F", "Humidity ratio: 6 lb/klb"]);
    expect(ip.hoverText[10][25][2]).toBe(hoverText[10][25][2]);
  });

  it("reads every compared slot's number, each labelled by its slot", () => {
    const slots = [startingSlot(pmvPpdIso), enteredSlotFor(pmvPpdIso, { clo: 1 }), enteredSlotFor(pmvPpdIso, { met: 1.4 })];
    const compared = hoverGridOf(psychrometricSpec(chartRequestForSlots(pmvPpdIso, slots))).hoverText;
    const alone = slots.map((entered) => hoverGridOf(psychrometricSpec(chartRequestFor(pmvPpdIso, entered))).hoverText);
    expect(compared[10][25]).toEqual([
      ...hoverText[10][25].slice(0, 2),
      ...alone.map((field, position) => copy.slotEntry(slotBadges[position].name, field[10][25][2])),
    ]);
    expect(new Set(alone.map((field) => field[10][25][2])).size).toBe(3);
  });
});
