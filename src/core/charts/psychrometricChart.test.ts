/**
 * The psychrometric chart given no Band list, as the Standard page asks for
 * it: each slot's Comfort zones traced from its own scan over the
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
import { imageSize } from "$lib/core/image";
import { valuesReader } from "$lib/core/libraryInputs";
import { psychrometricChartOf, type ComfortZone, type RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import { palette } from "$lib/core/palette";
import { DEFAULT_ATMOSPHERIC_PRESSURE, quantities } from "$lib/core/quantities";
import { startingSlot, withEnteredValues, type Slot } from "$lib/core/slot";
import { displayUnitFor, numberWithUnit } from "$lib/core/units";
import { unitSystem, type UnitSystem } from "$lib/core/unitSystem";
import { registeredModels } from "$lib/models";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { Annotation, ChartSpec, HoverGridTrace, PathTrace, PointTrace } from "./chartSpec";
import { onlyPieceOf, regionOf, zoneFillsOf, zoneLinesOf } from "./chartTestPaths";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { psychrometricScanFrameFor, psychrometricSpec } from "./psychrometricChart";
import { GRID, scannedField } from "./scan";
import { samples } from "./specParts";

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

/** Slot 1's scan of `drawn`'s chart: the number in SI, `[yIndex][xIndex]`, over the samples its hover grid reads, in display units. */
interface Scanned {
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly values: readonly (readonly number[])[];
}

function scannedOf(drawn: ChartRequest): Scanned {
  const frame = psychrometricScanFrameFor(drawn.model, drawn.entryModes, drawn.atmosphericPressure);
  const { x, y } = hoverGridOf(psychrometricSpec(drawn));
  return { x, y, values: scannedField(frame, drawn.slots[0].slot).values };
}

/** The ISO declaration's zones, largest first: the order the chart draws them in. */
function isoZonesLargestFirst() {
  return [...pmvPpdIso.scan.comfortZones].sort((a, b) => b.limit - a.limit);
}

/** {@link request} under separate entry, of the ISO declaration with `zones` in its scan instead of its own. */
function requestWithZones(zones: readonly [ComfortZone, ...ComfortZone[]]): ChartRequest {
  return { ...request(temperatureMode.separate), model: { ...pmvPpdIso, scan: { ...pmvPpdIso.scan, comfortZones: zones } } };
}

function hoverGridOf(spec: ChartSpec): HoverGridTrace {
  const trace = spec.traces.find((entry): entry is HoverGridTrace => entry.kind === "hoverGrid");
  if (!trace) {
    throw new Error("spec has no hover grid");
  }
  return trace;
}

/** The relative-humidity isolines: the paths named for a relative humidity, the saturation line the last. */
function isolinesOf(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter((trace): trace is PathTrace => trace.kind === "path" && Boolean(trace.label?.startsWith(q.rh.label)));
}

/** PMV (ISO 7730) whose every run breaks no bound, so its zones are its numbers' alone. */
const isoWithoutBounds: RegisteredModel = {
  ...pmvPpdIso,
  run: (values) => ({ ...pmvPpdIso.run(values), warnings: [] }),
};

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

/** Whether the cell of `scan` at (`xIndex`, `yIndex`) is supersaturated: its relative humidity above 100. */
function isSupersaturated(scan: Scanned, xIndex: number, yIndex: number): boolean {
  return hr_to_rh(hrUnit.toSi(scan.y[yIndex]), scan.x[xIndex], p) > 100;
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

/** The single-column Image's plot width, in px: the column less the figure's side margins. */
const singleColumnPlotWidth = (imageSize.singleColumn.widthMm * 96) / 25.4 - 52 - 12;

/**
 * Plots the isoline labels must keep apart at, in px, with the lettering's
 * size: the page's plot, the chart at its cap of 512 × 384 less the adapter's
 * margins, its labels at 10 px (`ui/charts/plotlyFigure.ts`), and the
 * narrower of the Image's two, the single column at 4:3, its labels at 8 pt
 * (`ui/charts/plotlyImage.ts`).
 */
const labelFrames = [
  { name: "the page's plot", width: 512 - 64 - 16, height: 384 - 12 - 48, lettering: 10 },
  { name: "the single-column Image", width: singleColumnPlotWidth, height: singleColumnPlotWidth * 0.75, lettering: (8 * 96) / 72 },
] as const;

type LabelFrame = (typeof labelFrames)[number];

/** A point of the plot, in px from its top-left corner. */
interface PlotPoint {
  readonly x: number;
  readonly y: number;
}

/** A label's box on the plot, in px from its top-left corner. */
interface LabelBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The point (`x`, `y`) of `spec`'s axes on a plot `frame` big. */
function plotPointOf(x: number, y: number, spec: ChartSpec, frame: LabelFrame): PlotPoint {
  const [xMin, xMax] = spec.layout.x.range;
  const [yMin, yMax] = spec.layout.y.range;
  return { x: ((x - xMin) / (xMax - xMin)) * frame.width, y: ((yMax - y) / (yMax - yMin)) * frame.height };
}

/**
 * The box `annotation` takes on a plot `frame` big over `spec`'s axes,
 * anchored as the adapter anchors it: its top-right corner on the point. A
 * label's characters are taken as 0.7 of the lettering wide on average, more
 * than a label measures in either face it is drawn in ("100 %" is 3.4 at the
 * page's 10 px), and a line as Plotly's 1.3; Plotly pads the box by 1 px.
 */
function labelBoxOf(annotation: Annotation, spec: ChartSpec, frame: LabelFrame): LabelBox {
  const corner = plotPointOf(annotation.x, annotation.y, spec, frame);
  return {
    left: corner.x - annotation.text.length * 0.7 * frame.lettering - 2,
    right: corner.x,
    top: corner.y,
    bottom: corner.y + 1.3 * frame.lettering + 2,
  };
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Whether `point` lies inside `box`, short of its edges. */
function covers(box: LabelBox, point: PlotPoint): boolean {
  return box.left < point.x && point.x < box.right && box.top < point.y && point.y < box.bottom;
}

describe("psychrometricSpec", () => {
  const spec = psychrometricSpec(request(temperatureMode.separate));

  it("paints one fill per declared limit, largest first, each holding the grid points whose number is within its limit", () => {
    const zones = isoZonesLargestFirst();
    const drawn = psychrometricSpec({ ...request(temperatureMode.separate), model: isoWithoutBounds });
    const fills = zoneFillsOf(drawn);
    const { values } = scannedOf(request(temperatureMode.separate));
    expect(zones).toHaveLength(4);
    expect(fills.map((zone) => zone.label)).toEqual(zones.map((zone) => copy.zoneLegend(zone)));
    fills.forEach((fill, position) => {
      const expected = values.map((row) => row.map((value) => Math.abs(value) < zones[position].limit));
      expect(regionOf(drawn, fill), fill.label).toEqual(expected);
    });
  });

  it("fills them in the slot's hue, the opacity rising inwards", () => {
    const drawn = zoneFillsOf(spec);
    expect(drawn.map((zone) => zone.color)).toEqual(drawn.map((_, level) => chartInk.zoneFill(palette.slots[0], level, 4)));
    expect(drawn.map((zone) => zone.fill)).toEqual(drawn.map((zone) => zone.color));
  });

  it("lays every zone's line after every zone's fill, each along its own fill's boundary, in the slot's zone line", () => {
    const fills = zoneFillsOf(spec);
    const lines = zoneLinesOf(spec);
    const lastFill = spec.traces.indexOf(fills[fills.length - 1]);
    expect(lines.every((line) => spec.traces.indexOf(line) > lastFill)).toBe(true);
    expect(lines.map((line) => line.label)).toEqual(fills.map((fill) => fill.label));
    lines.forEach((line, position) => {
      const vertices = new Set(fills[position].pieces.flatMap((ring) => ring.x.map((x, index) => `${x} ${ring.y[index]}`)));
      expect(line.pieces.length).toBeGreaterThan(0);
      expect(line.pieces.every((piece) => piece.x.every((x, index) => vertices.has(`${x} ${piece.y[index]}`)))).toBe(true);
    });
    expect(lines.every((line) => line.color === chartInk.zoneLine(palette.slots[0]) && line.width === chartInk.zoneLineWidth)).toBe(true);
  });

  it("scans the drawn axes: the temperature axis and the humidity ratio, in display units", () => {
    const { x, y } = hoverGridOf(spec);
    expect([x[0], x[x.length - 1]]).toEqual(spec.layout.x.range);
    expect(y[0]).toBe(spec.layout.y.range[0]);
    expect(y[y.length - 1]).toBeCloseTo(spec.layout.y.range[1], 2);
  });

  it("numbers a cell with the model's own output at its temperature and the library's relative humidity, the supersaturated ones too", () => {
    const scan = scannedOf(request(temperatureMode.separate));
    // The last cell is supersaturated, run at its true relative humidity above 100.
    expect(isSupersaturated(scan, 0, 50)).toBe(true);
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40], [40, 50], [50, 0]]) {
      expect(scan.values[yIndex][xIndex]).toBe(numberAt(slot(temperatureMode.separate), scan.x[xIndex], hrUnit.toSi(scan.y[yIndex])));
    }
  });

  it("hands the model the slot's own inputs: tr as entered, vr derived, clothing corrected", () => {
    const scan = scannedOf(request(temperatureMode.separate));
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40]]) {
      const db = scan.x[xIndex];
      expect(scan.values[yIndex][xIndex]).toBeCloseTo(pmvAt(db, hr_to_rh(hrUnit.toSi(scan.y[yIndex]), db, p), 24), PMV_DIGITS);
    }
  });

  it("scans the operative temperature under operative entry, with tr following it", () => {
    const drawn = psychrometricSpec(request(temperatureMode.operative));
    const scan = scannedOf(request(temperatureMode.operative));
    expect(drawn.layout.x.title).toContain(q.operative_tmp.label);
    expect(zoneFillsOf(drawn)).toHaveLength(4);
    for (const [yIndex, xIndex] of [[0, 0], [10, 25], [20, 40]]) {
      const db = scan.x[xIndex];
      expect(scan.values[yIndex][xIndex]).toBeCloseTo(pmvAt(db, hr_to_rh(hrUnit.toSi(scan.y[yIndex]), db, p), db), PMV_DIGITS);
    }
  });

  it("ends a zone where the model stops giving a number, the end found on the run as a bound's is", () => {
    const noNumberWhenDry: RegisteredModel = {
      ...pmvPpdIso,
      run: (values) => ({ ...pmvPpdIso.run(values), ...(values.rh < 10 ? { pmv: Number.NaN } : {}) }),
    };
    const drawn = psychrometricSpec({ ...request(temperatureMode.separate), model: noNumberWhenDry });
    const [zone] = zoneFillsOf(drawn);
    const [whole] = zoneFillsOf(spec);
    const { x, y } = hoverGridOf(drawn);
    const isDry = (xIndex: number, yIndex: number) => hr_to_rh(hrUnit.toSi(y[yIndex]), x[xIndex], p) < 10;
    const expected = regionOf(spec, whole).map((row, yIndex) => row.map((held, xIndex) => held && !isDry(xIndex, yIndex)));
    expect(regionOf(drawn, zone)).toEqual(expected);
    // The zone reaches the dry air by its numbers, so the end cuts it.
    expect(regionOf(spec, whole)).not.toEqual(expected);
    // A vertex on a grid line where the number ends lies on the 10 % isoline, to a bisection step.
    const atEnd = zone.pieces.flatMap((ring) => ring.x.map((temperature, index) => hr_to_rh(hrUnit.toSi(ring.y[index]), temperature, p)));
    expect(atEnd.some((rh) => Math.abs(rh - 10) < 0.05)).toBe(true);
  });

  it("paints the scan it is handed rather than scanning again", () => {
    const frame = psychrometricScanFrameFor(pmvPpdIso, request(temperatureMode.separate).entryModes, p);
    const [xs, ys] = [samples(frame.x.range, GRID), samples(frame.y.range, GRID)];
    const everywhere = <Value>(value: Value) => ys.map(() => xs.map(() => value));
    // Each zone handed as the whole field: its one ring is the plot's frame.
    const whole = { x: xs, y: ys, inside: everywhere(true), across: everywhere(undefined), up: everywhere(undefined), centre: everywhere(undefined) };
    const handed = { values: everywhere(0.1), zones: [whole, whole, whole, whole], regionWithin: () => whole };
    const drawn = psychrometricSpec(request(temperatureMode.separate), [handed]);
    const frameRing = { x: [xs[0], xs[50], xs[50], xs[0]], y: [ys[0], ys[0], ys[50], ys[50]].map((hr) => hrUnit.fromSi(hr)) };
    expect(zoneFillsOf(drawn).map((zone) => zone.pieces)).toEqual([[frameRing], [frameRing], [frameRing], [frameRing]]);
    expect(hoverGridOf(drawn).hoverText[0][0][2]).toBe(`${q.pmv.label}: 0.1`);
  });

  it.each([1, 3])(
    "draws the fills, the isolines below saturation, the outlines, the hover grid, the cover, the saturation line, then the markers, of %i slot(s)",
    (count) => {
      const drawn = psychrometricSpec(chartRequestForSlots(pmvPpdIso, Array.from({ length: count }, () => slot(temperatureMode.separate))));
      const isolines = isolinesOf(drawn);
      const saturationLine = isolines[isolines.length - 1];
      expect(isolines).toHaveLength(10);
      expect(isolines.map((isoline) => isoline.color)).toEqual([...Array(9).fill(chartInk.isoline), chartInk.saturationLine]);
      expect(markersOf(drawn)).toHaveLength(count);
      expect(drawn.traces).toEqual([
        ...zoneFillsOf(drawn),
        ...isolines.slice(0, -1),
        ...zoneLinesOf(drawn),
        hoverGridOf(drawn),
        coverOf(drawn),
        saturationLine,
        ...markersOf(drawn),
      ]);
    },
  );

  it("covers the chart above the saturation line as it does given a Band list", () => {
    const banded = psychrometricSpec({ ...request(temperatureMode.separate), bands: bandListOf(pmvPpdIso.scan.classifier) });
    expect(coverOf(spec)).toEqual(coverOf(banded));
  });

  it("draws the zones of the model it is handed, a one-zone scan as one zone", () => {
    const zone = intervalZone(copy.comfortZone, PMV_COMPLIANCE_INTERVAL_ASHRAE);
    const drawn = psychrometricSpec(requestWithZones([zone]));
    expect([...zoneFillsOf(drawn), ...zoneLinesOf(drawn)].map((trace) => [trace.fill !== undefined, trace.label])).toEqual([
      [true, copy.zoneLegend(zone)],
      [false, copy.zoneLegend(zone)],
    ]);
    expect(drawn.legend.map((entry) => entry.swatch)).toEqual(["line", "fill", "marker"]);
  });

  it("names the zones drawn today by their limit, word for word", () => {
    const zoneLabels = (model: RegisteredModel) =>
      zoneFillsOf(psychrometricSpec(chartRequestFor(model, startingSlot(model)))).map((zone) => zone.label);
    expect(zoneLabels(pmvPpdIso)).toEqual([
      "Category IV (|PMV| < 1)",
      "Category III (|PMV| < 0.7)",
      "Category II (|PMV| < 0.5)",
      "Category I (|PMV| < 0.2)",
    ]);
    expect(zoneLabels(pmvPpdAshrae)).toEqual(["Comfort zone (|PMV| < 0.5)"]);
  });

  it("writes a zone's limit as every number on screen is written", () => {
    const zone = { label: copy.comfortZone, limit: 1 / 3, inclusive: true };
    const drawn = psychrometricSpec(requestWithZones([zone]));
    expect(zoneFillsOf(drawn).map((trace) => trace.label)).toEqual(["Comfort zone (|PMV| ≤ 0.33)"]);
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
    // The declared viewport is 10–35 °C.
    expect(spec.layout.x.range[0]).toBeCloseTo(50, 10);
    expect(spec.layout.x.range[1]).toBeCloseTo(95, 10);
    const marker = spec.traces.find((trace): trace is PointTrace => trace.kind === "point");
    expect(marker?.x).toBeCloseTo(78.8, 10);
    // The zones over the same scan as in SI, every vertex the SI vertex converted.
    const temperatureUnit = displayUnitFor(q.tdb, unitSystem.ip);
    const ipHrUnit = displayUnitFor(q.hr, unitSystem.ip);
    const ipZones = zoneFillsOf(spec);
    const siZones = zoneFillsOf(psychrometricSpec(request(temperatureMode.separate)));
    expect(ipZones).toHaveLength(siZones.length);
    ipZones.forEach((zone, position) => {
      const converted = siZones[position].pieces.flatMap((ring) =>
        ring.x.flatMap((x, index) => [temperatureUnit.fromSi(x), ipHrUnit.fromSi(hrUnit.toSi(ring.y[index]))]),
      );
      const shown = zone.pieces.flatMap((ring) => ring.x.flatMap((x, index) => [x, ring.y[index]]));
      expect(shown).toHaveLength(converted.length);
      shown.forEach((value, index) => expect(value).toBeCloseTo(converted[index], 9));
    });
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

  it("labels every other relative-humidity isoline where it leaves the viewport", () => {
    const spec = psychrometricSpec(request(temperatureMode.separate));
    expect(spec.annotations.map((entry) => entry.text)).toEqual(["20 %", "40 %", "60 %", "80 %", "100 %"]);
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
    expect(spec.legend.map((entry) => entry.swatch)).toEqual(["line", "fill", "fill", "fill", "fill", "marker"]);
    expect(spec.legend[0].label).toBe(q.rh.label);
    expect(spec.legend.slice(1, 5).map((entry) => entry.label)).toEqual(
      isoZonesLargestFirst().map((zone) => copy.zoneLegend(zone)),
    );
  });
});

describe("the psychrometric chart's hover readout on the Standard page", () => {
  const spec = psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)));
  const { hoverText } = hoverGridOf(spec);
  /** The same scan, which keeps the cell's own number wherever a zone leaves the cell out. */
  const scan = scannedOf(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso)));
  const pmvUnit = displayUnitFor(q.pmv, unitSystem.si);

  it("is read off the hover grid alone", () => {
    expect(spec.traces.filter((trace) => trace.hover !== "off").map((trace) => trace.kind)).toEqual(["hoverGrid"]);
  });

  it("reads the temperature, the humidity ratio and the slot's number, no relative humidity and no zone name", () => {
    // Cell (row 10, column 30) at PMV (ISO 7730)'s defaults: 25 °C, 6 g/kg, about 30 %.
    expect(hoverText[10][30]).toEqual([
      "Dry-bulb air temperature: 25 °C",
      "Humidity ratio: 6 g/kg",
      "Predicted Mean Vote: -0.56",
    ]);
    expect(new Set(hoverText.flat().map((readout) => readout.length))).toEqual(new Set([3]));
  });

  it("reads the cell's own number in every cell below saturation, and \"—\" above it, where the cell still carries one", () => {
    scan.values.forEach((row, yIndex) =>
      row.forEach((value, xIndex) => {
        const expected = isSupersaturated(scan, xIndex, yIndex) ? Number.NaN : value;
        expect(hoverText[yIndex][xIndex][2]).toBe(`${q.pmv.label}: ${numberWithUnit(expected, pmvUnit)}`);
      }),
    );
    expect(Number.isFinite(scan.values[scan.values.length - 1][0])).toBe(true);
    expect(hoverText[scan.values.length - 1][0][2]).toBe(`${q.pmv.label}: ${copy.notAvailable}`);
  });

  it("reads under operative entry the operative temperature", () => {
    const operative = hoverGridOf(psychrometricSpec(request(temperatureMode.operative)));
    expect(operative.hoverText[10][30][0]).toBe(`${q.operative_tmp.label}: 25 °C`);
  });

  it("reads in IP units in IP", () => {
    const ip = hoverGridOf(psychrometricSpec(chartRequestFor(pmvPpdIso, startingSlot(pmvPpdIso), unitSystem.ip)));
    expect(ip.hoverText[10][30].slice(0, 2)).toEqual(["Dry-bulb air temperature: 77 °F", "Humidity ratio: 6 lb/klb"]);
    expect(ip.hoverText[10][30][2]).toBe(hoverText[10][30][2]);
  });

  it("reads every compared slot's number, each labelled by its slot", () => {
    const slots = [startingSlot(pmvPpdIso), enteredSlotFor(pmvPpdIso, { clo: 1 }), enteredSlotFor(pmvPpdIso, { met: 1.4 })];
    const compared = hoverGridOf(psychrometricSpec(chartRequestForSlots(pmvPpdIso, slots))).hoverText;
    const alone = slots.map((entered) => hoverGridOf(psychrometricSpec(chartRequestFor(pmvPpdIso, entered))).hoverText);
    expect(compared[10][30]).toEqual([
      ...hoverText[10][30].slice(0, 2),
      ...alone.map((field, position) => copy.slotEntry(`Input ${position + 1}`, field[10][30][2])),
    ]);
    expect(new Set(alone.map((field) => field[10][30][2])).size).toBe(3);
  });
});

describe("the relative-humidity labels at the plot's size", () => {
  const charts = registeredModels
    .filter((model) => psychrometricChartOf(model) !== undefined)
    .flatMap((model) => [unitSystem.si, unitSystem.ip].map((system) => ({ model, system })));

  it.each(charts.flatMap((chart) => labelFrames.map((frame) => ({ ...chart, frame }))))(
    "keeps every label clear of every other and of every other isoline's end: $model.info.label, $system.id, $frame.name",
    ({ model, system, frame }) => {
      const spec = psychrometricSpec(chartRequestFor(model, startingSlot(model), system));
      const boxes = spec.annotations.map((annotation) => labelBoxOf(annotation, spec, frame));
      const ends = isolinesOf(spec).map((isoline) => {
        const { x, y } = onlyPieceOf(isoline);
        return { label: isoline.label, point: plotPointOf(x[x.length - 1], y[y.length - 1], spec, frame) };
      });
      boxes.forEach((box, index) => {
        const text = spec.annotations[index].text;
        boxes.forEach((other, otherIndex) => {
          if (otherIndex !== index) {
            expect(overlaps(box, other), `${text} on ${spec.annotations[otherIndex].text}`).toBe(false);
          }
        });
        // Its own isoline ends on its corner, every other one clear of it.
        for (const end of ends.filter((entry) => !entry.label?.endsWith(` ${text}`))) {
          expect(covers(box, end.point), `${text} on the end of ${end.label}`).toBe(false);
        }
      });
    },
  );
});
