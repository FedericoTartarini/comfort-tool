/**
 * Every builder given a list of slots (ADR-0002 decision 50): every slot
 * draws the declaration's Comfort zones at its own values and one
 * marker, in its own hue, and what the slots share is drawn once. A slot's
 * expected zones and marker are the ones a list holding that slot alone
 * gives, so no number here is written by hand.
 */
import { describe, expect, it } from "vitest";
import { chartInk } from "$lib/core/bandPalette";
import { airSpeedMode, clothingMode, temperatureMode } from "$lib/core/entryModes";
import {
  dynamicChartOf,
  type ComfortZone,
  type DeclaredDynamicChart,
  type RegisteredModel,
} from "$lib/core/modelDeclaration";
import {
  enteredSlotFor,
  entryModesWithAirSpeed,
  entryModesWithClothing,
  entryModesWithTemperature,
} from "$lib/core/declarationTestSlots";
import {
  dynamicClothingOf,
  operativeTemperatureOf,
  relativeAirSpeedOf,
  startingSlot,
  withAirSpeedMode,
  withClothingMode,
  withTemperatureMode,
  type Slot,
} from "$lib/core/slot";
import { imageDescription, imageSize } from "$lib/core/image";
import { slotBadges } from "$lib/core/slotBadge";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { quantities } from "$lib/core/quantities";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import { adaptiveSpec } from "./adaptiveChart";
import type { ChartSpec, ContourFillTrace, ContourLineTrace, HoverGridTrace, PathTrace, PointTrace } from "./chartSpec";
import { chartRequestFor, chartRequestForSlots } from "./chartTestRequests";
import { dynamicSpec } from "./dynamicChart";
import { psychrometricSpec } from "./psychrometricChart";

const q = quantities;

/** A zone's fill of either kind: a filled path between two limit lines, or a contour fill of a scanned field. */
type ZoneFill = PathTrace | ContourFillTrace;

/** A zone's stroke of either kind: a limit line, or a contour line of a scanned field. */
type ZoneLine = PathTrace | ContourLineTrace;

/** The zones' fills: the contour fills and the filled paths but the cover in the plot's ground. */
function zoneFillsOf(spec: ChartSpec): ZoneFill[] {
  return spec.traces.filter(
    (trace): trace is ZoneFill =>
      trace.kind === "contourFill" || (trace.kind === "path" && trace.fill !== undefined && trace.fill !== chartInk.ground),
  );
}

/** The relative-humidity curves: the paths in the isolines' and the saturation line's ink. */
function isolinesOf(spec: ChartSpec): PathTrace[] {
  return spec.traces.filter(
    (trace): trace is PathTrace =>
      trace.kind === "path" && (trace.color === chartInk.isoline || trace.color === chartInk.saturationLine),
  );
}

/** What strokes a zone: a contour line, or a limit line, a stroked path but an isoline. */
function outlinesOf(spec: ChartSpec): ZoneLine[] {
  const isolines = isolinesOf(spec);
  return spec.traces.filter(
    (trace): trace is ZoneLine =>
      trace.kind === "contourLine" || (trace.kind === "path" && trace.fill === undefined && !isolines.includes(trace)),
  );
}

/** A scanned chart's zone outlines, one contour line per zone, with no Band list. */
function contourLinesOf(spec: ChartSpec): ContourLineTrace[] {
  return spec.traces.filter((trace): trace is ContourLineTrace => trace.kind === "contourLine");
}

function markersOf(spec: ChartSpec): PointTrace[] {
  return spec.traces.filter((trace): trace is PointTrace => trace.kind === "point");
}

/** A zone's fill colour, whichever kind it is. */
function fillColorOf(zone: ZoneFill): string | undefined {
  return zone.kind === "path" ? zone.fill : zone.color;
}

/** A zone's shape, whichever kind its fill or line is: its path, or its field and interval. */
function shapeOf(zone: ZoneFill | ZoneLine) {
  return zone.kind === "path" ? { x: zone.x, y: zone.y } : { x: zone.x, y: zone.y, z: zone.z, lower: zone.lower, upper: zone.upper };
}

function alphaOf(fill: string | undefined): number {
  const match = /, ([\d.]+)\)$/.exec(fill ?? "");
  if (!match) {
    throw new Error(`${fill} is not an rgba() fill`);
  }
  return Number(match[1]);
}

/** The Comfort zones `model`'s scan declares. */
function declaredZonesOf(model: RegisteredModel): readonly ComfortZone[] {
  const zones = model.scan?.comfortZones;
  if (!zones) {
    throw new Error(`${model.info.label} declares no Comfort zones`);
  }
  return zones;
}

function dynamicOf(model: RegisteredModel): DeclaredDynamicChart {
  const chart = dynamicChartOf(model);
  if (!chart) {
    throw new Error(`${model.info.label} declares no dynamic chart`);
  }
  return chart;
}

/** Three slots that differ in what moves a zone: slot 1 at the defaults, then more clothing, then more activity. */
function threeSlots(model: RegisteredModel): Slot[] {
  return [startingSlot(model), enteredSlotFor(model, { clo: 1 }), enteredSlotFor(model, { met: 1.4 })];
}

/** A named way to draw a model's chart of a list of slots, and how many zones each slot has on it. */
interface Drawing {
  readonly name: string;
  readonly slots: readonly Slot[];
  readonly draw: (slots: readonly Slot[]) => ChartSpec;
  readonly zonesPerSlot: number;
}

function psychrometricDrawing(model: RegisteredModel): Drawing {
  return {
    name: `${model.info.label}, psychrometric`,
    slots: threeSlots(model),
    draw: (slots) => psychrometricSpec(chartRequestForSlots(model, slots)),
    zonesPerSlot: declaredZonesOf(model).length,
  };
}

function dynamicDrawing(model: RegisteredModel): Drawing {
  const chart = dynamicOf(model);
  return {
    name: `${model.info.label}, dynamic`,
    slots: threeSlots(model),
    draw: (drawn) => dynamicSpec(chartRequestForSlots(model, drawn), chart.axes),
    zonesPerSlot: declaredZonesOf(model).length,
  };
}

/** Adaptive's chart, whose two acceptability zones move with the air speed alone. */
const adaptiveDrawing: Drawing = {
  name: `${adaptiveAshrae.info.label}, adaptive`,
  slots: [startingSlot(adaptiveAshrae), enteredSlotFor(adaptiveAshrae, { v: 0.9 }), enteredSlotFor(adaptiveAshrae, { v: 1.2 })],
  draw: (drawn) => adaptiveSpec(chartRequestForSlots(adaptiveAshrae, drawn)),
  zonesPerSlot: 2,
};

const drawings: readonly Drawing[] = [
  psychrometricDrawing(pmvPpdIso),
  psychrometricDrawing(pmvPpdAshrae),
  dynamicDrawing(pmvPpdIso),
  dynamicDrawing(pmvPpdAshrae),
  adaptiveDrawing,
];

/** The legend's zone entries: every entry but the markers' and the relative-humidity curves'. */
function zoneLegendOf(spec: ChartSpec) {
  return spec.legend.filter((entry) => entry.swatch !== "marker" && entry.color !== chartInk.isoline);
}

/**
 * One slot's zones are nested fills, and two or three slots' are outlines in
 * each slot's hue with no fill (ADR-0002 decision 69).
 */
describe.each(drawings)("$name, drawn of one slot", ({ slots, draw, zonesPerSlot }) => {
  const spec = draw([slots[0]]);
  const zones = zoneFillsOf(spec);
  const [badge] = slotBadges;

  it("fills its zones in its hue, nested, the opacity rising inwards, each with a fill swatch", () => {
    expect(zones).toHaveLength(zonesPerSlot);
    const alphas = zones.map((zone) => alphaOf(fillColorOf(zone)));
    expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
    expect(new Set(alphas).size).toBe(zonesPerSlot);
    expect(zones.map(fillColorOf)).toEqual(zones.map((_, level) => chartInk.zoneFill(badge.hue, level, zonesPerSlot)));
    expect(zoneLegendOf(spec)).toEqual(zones.map((zone) => ({ label: zone.label, swatch: "fill", color: fillColorOf(zone) })));
  });

  it("lays its outlines after its fills, so no fill hides an outline", () => {
    const lastFill = Math.max(...zones.map((zone) => spec.traces.indexOf(zone)));
    const firstOutline = Math.min(...outlinesOf(spec).map((outline) => spec.traces.indexOf(outline)));
    expect(firstOutline).toBeGreaterThan(lastFill);
  });

  it("draws its marker filled in its hue", () => {
    expect(markersOf(spec).map((marker) => ({ label: marker.label, color: marker.color }))).toEqual([
      { label: badge.name, color: chartInk.marker(badge.hue) },
    ]);
  });
});

describe.each(drawings)("$name, drawn of two slots", ({ slots, draw }) => {
  const spec = draw(slots.slice(0, 2));

  it("fills no zone, and outlines and names each in its slot's hue, with a line swatch", () => {
    expect(zoneFillsOf(spec)).toEqual([]);
    slotBadges.slice(0, 2).forEach((badge) => {
      const color = chartInk.zoneLine(badge.hue);
      const outlines = outlinesOf(spec).filter((outline) => outline.label?.startsWith(badge.name));
      const entries = zoneLegendOf(spec).filter((entry) => entry.label.startsWith(badge.name));
      expect(outlines.length).toBeGreaterThan(0);
      expect(outlines.every((outline) => outline.color === color)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((entry) => entry.swatch === "line" && entry.color === color)).toBe(true);
    });
    expect(zoneLegendOf(spec).every((entry) => entry.swatch === "line")).toBe(true);
  });

  it("draws two markers filled, each in its slot's hue", () => {
    expect(markersOf(spec).map((marker) => marker.color)).toEqual(slotBadges.slice(0, 2).map((badge) => chartInk.marker(badge.hue)));
  });
});

describe.each(drawings)("$name, drawn of three slots", ({ slots, draw, zonesPerSlot }) => {
  const spec = draw(slots);

  it("draws three markers and each slot's zones as outlines alone, each named and coloured by its slot", () => {
    expect(markersOf(spec).map((marker) => ({ label: marker.label, color: marker.color }))).toEqual(
      slotBadges.map((badge) => ({ label: badge.name, color: chartInk.marker(badge.hue) })),
    );
    expect(zoneFillsOf(spec)).toEqual([]);
    const outlines = outlinesOf(spec);
    slotBadges.forEach((badge) => {
      const outlinesOfSlot = outlines.filter((outline) => outline.label?.startsWith(badge.name));
      expect(outlinesOfSlot.length).toBeGreaterThanOrEqual(zonesPerSlot);
      expect(outlinesOfSlot.map((outline) => ({ color: outline.color, width: outline.width }))).toEqual(
        outlinesOfSlot.map(() => ({ color: chartInk.zoneLine(badge.hue), width: chartInk.zoneLineWidth })),
      );
    });
    expect(outlines.every((outline) => slotBadges.some((badge) => outline.label?.startsWith(badge.name)))).toBe(true);
  });

  it("draws each slot's outlines and marker as a list holding that slot alone draws them", () => {
    slots.forEach((slot, position) => {
      const alone = draw([slot]);
      const outlinesPerSlot = outlinesOf(alone).length;
      expect(outlinesOf(spec).slice(position * outlinesPerSlot, (position + 1) * outlinesPerSlot).map(shapeOf)).toEqual(
        outlinesOf(alone).map(shapeOf),
      );
      const [marker] = markersOf(alone);
      expect({ x: markersOf(spec)[position].x, y: markersOf(spec)[position].y }).toEqual({ x: marker.x, y: marker.y });
    });
  });

  it("draws the axes, the relative-humidity curves and the hover grid once", () => {
    const alone = draw([slots[0]]);
    expect(spec.layout).toEqual(alone.layout);
    expect(spec.annotations).toEqual(alone.annotations);
    expect(isolinesOf(spec)).toEqual(isolinesOf(alone));
    expect(spec.traces.filter((trace) => trace.hover !== "off").length).toBe(
      alone.traces.filter((trace) => trace.hover !== "off").length,
    );
  });

  it("has a line legend entry per slot per zone, in the slot's hue, and one marker entry per slot", () => {
    const expected = slots.flatMap((slot, position) =>
      zoneLegendOf(draw([slot])).map((entry) => ({
        label: copy.slotEntry(slotBadges[position].name, entry.label),
        swatch: "line",
        color: chartInk.zoneLine(slotBadges[position].hue),
      })),
    );
    expect(zoneLegendOf(spec)).toEqual(expected);
    expect(expected).toHaveLength(3 * zonesPerSlot);
    expect(spec.legend.filter((entry) => entry.swatch === "marker").map((entry) => entry.label)).toEqual(
      slotBadges.map((badge) => badge.name),
    );
  });
});

describe("PMV (ISO 7730) drawn of three slots", () => {
  it("outlines nine zones on either chart", () => {
    const slots = threeSlots(pmvPpdIso);
    const dynamic = dynamicOf(pmvPpdIso);
    expect(contourLinesOf(psychrometricSpec(chartRequestForSlots(pmvPpdIso, slots)))).toHaveLength(9);
    expect(contourLinesOf(dynamicSpec(chartRequestForSlots(pmvPpdIso, slots), dynamic.axes))).toHaveLength(9);
  });

  it("names each zone by its slot and by the zone", () => {
    const spec = psychrometricSpec(chartRequestForSlots(pmvPpdIso, threeSlots(pmvPpdIso)));
    const largest = [...declaredZonesOf(pmvPpdIso)].sort((a, b) => b.limit - a.limit)[0];
    expect(contourLinesOf(spec)[3].label).toBe(copy.slotEntry(slotBadges[1].name, copy.zoneLegend(largest)));
  });

  it("is drawn in the Image as on the screen, the same traces of the same kinds", () => {
    const spec = psychrometricSpec(chartRequestForSlots(pmvPpdIso, threeSlots(pmvPpdIso)));
    const image = imageDescription({ chart: spec, title: "", summaryAndFooter: null, size: imageSize.doubleColumn });
    expect(image.chart.traces.map((trace) => trace.kind)).toEqual(spec.traces.map((trace) => trace.kind));
    expect(image.chart.traces.some((trace) => trace.kind === "contourFill")).toBe(false);
    expect(image.chart.legend).toEqual(spec.legend);
  });
});

describe("the scanned dynamic chart drawn of more than one slot", () => {
  const chart = dynamicOf(pmvPpdIso);
  const slots = threeSlots(pmvPpdIso);
  const spec = dynamicSpec(chartRequestForSlots(pmvPpdIso, slots), chart.axes);

  function hoverGridOf(drawn: ChartSpec): HoverGridTrace {
    const grid = drawn.traces.find((trace): trace is HoverGridTrace => trace.kind === "hoverGrid");
    if (!grid) {
      throw new Error("no hover grid");
    }
    return grid;
  }

  it("strokes no band, every line being a slot's zone", () => {
    expect(contourLinesOf(spec).every((line) => slotBadges.some((badge) => line.label.startsWith(badge.name)))).toBe(true);
  });

  it("cuts each slot's zones from the field the slot alone is scanned on", () => {
    const zones = contourLinesOf(spec);
    slots.forEach((slot, position) => {
      const alone = contourLinesOf(dynamicSpec(chartRequestFor(pmvPpdIso, slot), chart.axes));
      expect(zones[position * 3].z).toEqual(alone[0].z);
    });
  });

  it("reads both axis values and each slot's number, named by the slot, in its one hover grid", () => {
    const grid = hoverGridOf(spec);
    const alone = slots.map((slot) => hoverGridOf(dynamicSpec(chartRequestFor(pmvPpdIso, slot), chart.axes)));
    expect(grid.hoverText[2][26]).toEqual([
      ...alone[0].hoverText[2][26].slice(0, 2),
      ...alone.map((field, position) => copy.slotEntry(slotBadges[position].name, field.hoverText[2][26][2])),
    ]);
  });
});

/**
 * A slot whose gate is closed keeps its last valid inputs in the entry mode
 * they were entered in, so a request may hold a slot in another temperature
 * entry mode than the session's (ADR-0002 decision 51).
 */
describe("a slot in another temperature entry mode than the session's", () => {
  const operative = withTemperatureMode(enteredSlotFor(pmvPpdIso, { tdb: 22, tr: 28 }), temperatureMode.operative, pmvPpdIso);
  const separate = enteredSlotFor(pmvPpdIso, { tdb: 22, tr: 28 });
  const xUnit = displayUnitFor(q.tdb, unitSystem.si);

  it("is drawn on the session's axes, at the temperature the entry-mode change converts it to", () => {
    const spec = psychrometricSpec(
      chartRequestForSlots(pmvPpdIso, [operative, separate], unitSystem.si, entryModesWithTemperature(temperatureMode.operative)),
    );
    expect(spec.layout.x.title).toContain(q.operative_tmp.label);
    expect(markersOf(spec)[1].x).toBe(xUnit.fromSi(operativeTemperatureOf(separate, pmvPpdIso)));
  });

  it("does not decide the axes when it is slot 1", () => {
    const spec = psychrometricSpec(
      chartRequestForSlots(pmvPpdIso, [separate, operative], unitSystem.si, entryModesWithTemperature(temperatureMode.operative)),
    );
    const alone = psychrometricSpec(chartRequestFor(pmvPpdIso, withTemperatureMode(separate, temperatureMode.operative, pmvPpdIso)));
    expect(spec.layout).toEqual(alone.layout);
    expect(markersOf(spec)[0].x).toBe(markersOf(alone)[0].x);
  });

  it("is scanned on the session's axes as the converted slot alone is", () => {
    const chart = dynamicOf(pmvPpdIso);
    const spec = dynamicSpec(
      chartRequestForSlots(pmvPpdIso, [operative, startingSlot(pmvPpdIso)], unitSystem.si, entryModesWithTemperature(temperatureMode.separate)),
      chart.axes,
    );
    const alone = dynamicSpec(
      chartRequestFor(pmvPpdIso, withTemperatureMode(operative, temperatureMode.separate, pmvPpdIso)),
      chart.axes,
    );
    expect(spec.layout.x.title).toContain(q.tdb.label);
    expect(markersOf(spec)[0].x).toBe(markersOf(alone)[0].x);
  });
});

/** The same, for the air-speed entry group: both builders convert the whole kept slot. */
describe("a slot in another air-speed entry mode than the session's", () => {
  const entered = enteredSlotFor(pmvPpdIso, { v: 0.4, met: 2 });
  const corrected = entryModesWithAirSpeed(airSpeedMode.corrected);

  it("is marked on the session's air-speed axis, at the value the entry-mode change converts it to", () => {
    const chart = dynamicOf(pmvPpdIso);
    const spec = dynamicSpec(chartRequestForSlots(pmvPpdIso, [startingSlot(pmvPpdIso), entered], unitSystem.si, corrected), chart.axes);
    const alone = dynamicSpec(chartRequestFor(pmvPpdIso, withAirSpeedMode(entered, airSpeedMode.corrected)), chart.axes);
    expect(spec.layout.y.title).toContain(q.vr.label);
    expect(markersOf(spec)[1].y).toBe(relativeAirSpeedOf(entered));
    expect(markersOf(spec)[1].y).toBe(markersOf(alone)[0].y);
  });

  // Back inverts the correction (ADR-0002 decision 54 as revised), so a slot
  // kept in relative air speed entry is drawn at the relative air speed its run
  // was given: marked at the air speed that gives it, its zones where they were.
  it("is drawn in an air-speed session at the relative air speed its run was given", () => {
    const chart = dynamicOf(pmvPpdIso);
    const kept = enteredSlotFor(pmvPpdIso, { vr: 0.7, met: 2 });
    const back = withAirSpeedMode(kept, airSpeedMode.uncorrected);
    const uncorrected = entryModesWithAirSpeed(airSpeedMode.uncorrected);
    const spec = dynamicSpec(chartRequestForSlots(pmvPpdIso, [kept], unitSystem.si, uncorrected), chart.axes);
    const alone = dynamicSpec(chartRequestFor(pmvPpdIso, back), chart.axes);
    expect(spec.layout.y.title).toContain(q.v.label);
    expect(spec.traces).toEqual(alone.traces);
    expect(markersOf(spec)[0].y).toBe(0.4);
    expect(relativeAirSpeedOf(back)).toBe(relativeAirSpeedOf(kept));

    const drawn = psychrometricSpec(chartRequestForSlots(pmvPpdIso, [kept], unitSystem.si, uncorrected));
    expect(drawn.traces).toEqual(psychrometricSpec(chartRequestFor(pmvPpdIso, back)).traces);
    expect(drawn.traces).toEqual(psychrometricSpec(chartRequestFor(pmvPpdIso, kept)).traces);
  });

  it("has its comfort zones scanned on the relative air speed the model is given, in either mode", () => {
    const kept = psychrometricSpec(chartRequestForSlots(pmvPpdIso, [entered], unitSystem.si, corrected));
    const converted = psychrometricSpec(chartRequestFor(pmvPpdIso, withAirSpeedMode(entered, airSpeedMode.corrected)));
    const uncorrected = psychrometricSpec(chartRequestFor(pmvPpdIso, entered));
    expect(kept.traces).toEqual(converted.traces);
    expect(converted.traces).toEqual(uncorrected.traces);
  });
});

/** The same, for the clothing entry group, on both PMV models: each corrects by its own standard's rule. */
describe.each([pmvPpdIso, pmvPpdAshrae])("a slot in another clothing entry mode than the session's, on $info.label", (model) => {
  const entered = enteredSlotFor(model, { clo: 1, met: 2 });
  const corrected = entryModesWithClothing(clothingMode.corrected);
  const clothingAxes = { x: q.tdb, y: q.clo };

  it("is marked on the session's clothing axis, at the dynamic clothing insulation the model was given", () => {
    const spec = dynamicSpec(chartRequestForSlots(model, [startingSlot(model), entered], unitSystem.si, corrected), clothingAxes);
    const alone = dynamicSpec(chartRequestFor(model, withClothingMode(entered, clothingMode.corrected, model)), clothingAxes);
    expect(spec.layout.y.title).toContain(q.clo_dynamic.label);
    expect(markersOf(spec)[1].y).toBe(dynamicClothingOf(entered, model));
    expect(markersOf(spec)[1].y).toBe(markersOf(alone)[0].y);
  });

  it("has its comfort zones scanned on the dynamic clothing insulation the model is given, in either mode", () => {
    const kept = psychrometricSpec(chartRequestForSlots(model, [entered], unitSystem.si, corrected));
    const converted = psychrometricSpec(chartRequestFor(model, withClothingMode(entered, clothingMode.corrected, model)));
    const uncorrected = psychrometricSpec(chartRequestFor(model, entered));
    expect(kept.traces).toEqual(converted.traces);
    expect(converted.traces).toEqual(uncorrected.traces);
    // Not the zones of the number entered: those are of 1 clo given to the model as it is.
    const uncorrectedNumber = psychrometricSpec(chartRequestFor(model, enteredSlotFor(model, { clo_dynamic: 1, met: 2 })));
    expect(zoneFillsOf(uncorrected).map(shapeOf)).not.toEqual(zoneFillsOf(uncorrectedNumber).map(shapeOf));
  });

  // Back inverts the correction (ADR-0002 decision 54 as revised a third
  // time), so a slot kept in dynamic clothing entry is drawn at the dynamic
  // clothing insulation its run was given: marked at the clothing insulation
  // that gives it, its zones where they were.
  it("is drawn in a clothing-insulation session at the dynamic clothing insulation its run was given", () => {
    const kept = withClothingMode(entered, clothingMode.corrected, model);
    const back = withClothingMode(kept, clothingMode.uncorrected, model);
    const uncorrected = entryModesWithClothing(clothingMode.uncorrected);
    const spec = dynamicSpec(chartRequestForSlots(model, [kept], unitSystem.si, uncorrected), clothingAxes);
    expect(spec.layout.y.title).toContain(q.clo.label);
    expect(spec.traces).toEqual(dynamicSpec(chartRequestFor(model, back), clothingAxes).traces);
    expect(markersOf(spec)[0].y).toBe(1);
    expect(dynamicClothingOf(back, model)).toBe(dynamicClothingOf(kept, model));

    const drawn = psychrometricSpec(chartRequestForSlots(model, [kept], unitSystem.si, uncorrected));
    expect(drawn.traces).toEqual(psychrometricSpec(chartRequestFor(model, back)).traces);
    expect(drawn.traces).toEqual(psychrometricSpec(chartRequestFor(model, kept)).traces);
  });
});
