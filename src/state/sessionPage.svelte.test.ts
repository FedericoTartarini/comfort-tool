/**
 * The page a session is on (ADR-0002 decision 57): one session serves every
 * page, and the address sets the page as it sets the model. Asserted at the
 * seam the other session tests use — a session in, its state and its outputs
 * out, with no component and no router — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives. The page is set as the address sets it.
 */
import { describe, expect, it } from "vitest";
import { bandListOf, type BandList } from "$lib/core/bands";
import { chartInk } from "$lib/core/bandPalette";
import type { ChartSpec, PathPiece, PointTrace, Trace } from "$lib/core/charts/chartSpec";
import { bandFillsOf, bandLinesOf, heldBetween, numbersAlong, regionOf, zoneFillsOf, zoneLinesOf } from "$lib/core/charts/chartTestPaths";
import { traceRegion } from "$lib/core/charts/regionTracer";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Page } from "$lib/core/page";
import { palette } from "$lib/core/palette";
import { quantities } from "$lib/core/quantities";
import { displayUnitFor } from "$lib/core/units";
import { unitSystem } from "$lib/core/unitSystem";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions, type SlotPosition } from "./session.svelte";
import { editBands, heldSlot, resultValueOf, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;
/** Humidity ratio as the SI chart draws it, in g/kg. */
const hrUnit = displayUnitFor(q.hr, unitSystem.si);

/** The positions of the slots whose markers `chart` draws, in slot order. */
function markedPositions(chart: ChartSpec | null): SlotPosition[] {
  const markers = (chart?.traces ?? []).filter((trace): trace is PointTrace => trace.kind === "point");
  return slotPositions.filter((position) => markers.some((marker) => marker.color === chartInk.marker(palette.slots[position])));
}

/** A Band's fills among `traces`, in drawing order. */
function fillsOf(traces: readonly Trace[]) {
  return bandFillsOf({ traces });
}

/** A Band's Edges among `traces`, in drawing order. */
function linesOf(traces: readonly Trace[]) {
  return bandLinesOf({ traces });
}

/**
 * Whether `traces`' Band fills hold, at every grid point, the points whose
 * scanned number `values` lies from each band's lower Edge of `list` up to
 * its last, every band of `list` coloured.
 */
function expectContiguousFills(traces: readonly Trace[], list: BandList, values: readonly (readonly number[])[]): void {
  const top = list.edges[list.edges.length - 1];
  expect(fillsOf(traces).map((fill) => regionOf({ traces }, fill))).toEqual(
    list.edges.map((_, index) => heldBetween(values, { lower: list.edges[index - 1], upper: top }, list.right)),
  );
}

/** Whether each of `traces`' Band lines, in the band line, runs where the scanned number `values` crosses its band's Edge of `list`. */
function expectEdgesCrossed(traces: readonly Trace[], list: BandList, values: readonly (readonly number[])[]): void {
  const lines = linesOf(traces);
  expect(lines).toHaveLength(list.edges.length);
  lines.forEach((line, index) => {
    for (const number of numbersAlong({ traces }, line, values)) {
      expect(number).toBeCloseTo(list.edges[index], 9);
    }
  });
}

/**
 * The layers of the psychrometric chart's `traces` in drawing order, each run
 * of one layer named once: a region's fill or line, a Comfort zone's or a
 * Band's alike; the isolines, the cover and the saturation line; or a trace's
 * kind.
 */
function psychrometricLayersOf(traces: readonly Trace[]): string[] {
  const layerOf = (trace: Trace) => {
    if (trace.kind !== "path") {
      return trace.kind;
    }
    if (trace.fill === chartInk.ground) {
      return "cover";
    }
    if (!trace.label?.startsWith(q.rh.label)) {
      return trace.fill === undefined ? "line" : "fill";
    }
    return trace.color === chartInk.saturationLine ? "saturationLine" : "isoline";
  };
  return traces.map(layerOf).filter((layer, index, layers) => layer !== layers[index - 1]);
}

/** `session` sent to `target` and its model, as the address sends it. */
function openAt(session: Session, target: Page, model: RegisteredModel = session.model): void {
  session.setAddress({ page: target, model });
}

describe("The page in the session", () => {
  it("opens on the Standard page", () => {
    expect(new Session(pmvPpdIso).page).toBe(page.standard);
  });

  it("takes the page and the model the address names", () => {
    const session = new Session(pmvPpdIso);
    // Inside Heat Index's bound, so the address's path has nothing to cut.
    session.slots[0].setEntered(q.tdb, 30);
    openAt(session, page.explore, heatIndexRothfusz);

    expect(session.page).toBe(page.explore);
    expect(session.model).toBe(heatIndexRothfusz);
    expect(resultValueOf(new Outputs(session).slots[0].result, q.hi)).toBeTypeOf("number");
  });

  it("paints Comfort zones and no band on the Standard page's dynamic chart with Compare off", () => {
    const session = new Session(pmvPpdIso);
    session.chart.type = chartType.dynamic;
    const traces = new Outputs(session).chart?.traces ?? [];

    expect(session.page).toBe(page.standard);
    expect(zoneFillsOf({ traces })).toHaveLength(4);
    expect(zoneLinesOf({ traces })).toHaveLength(4);
    expect(fillsOf(traces)).toEqual([]);
  });

  it("paints each drawn slot's Comfort zones on the Standard page's psychrometric chart over its own scan, Compare off and on, read by a hover grid", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    session.chart.type = chartType.psychrometric;
    const outputs = new Outputs(session);

    for (const compare of [false, true]) {
      session.setCompare(compare);
      const traces = outputs.chart?.traces ?? [];
      const fills = zoneFillsOf({ traces });
      const lines = zoneLinesOf({ traces });
      expect(fills).toHaveLength(4 * outputs.slots.length);
      expect(lines).toHaveLength(4 * outputs.slots.length);
      outputs.slots.forEach((slot, position) => {
        // Each zone is its own scan's traced, the humidity ratio shown in g/kg.
        const shown = (piece: PathPiece) => ({ x: piece.x, y: piece.y.map((hr) => hrUnit.fromSi(hr)) });
        const own = slot.scan.zones.map(traceRegion);
        expect(fills.slice(4 * position, 4 * position + 4).map((fill) => fill.pieces)).toEqual(own.map((zone) => zone.rings.map(shown)));
        expect(lines.slice(4 * position, 4 * position + 4).map((line) => line.pieces)).toEqual(own.map((zone) => zone.lines.map(shown)));
      });
      expect(traces.filter((trace) => trace.kind === "hoverGrid")).toHaveLength(1);
      expect(markedPositions(outputs.chart)).toEqual(compare ? [0, 1, 2] : [0]);
    }
  });

  it("lays the psychrometric chart out in one order, on Standard with Compare on and on Explore painting the Band list", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    session.chart.type = chartType.psychrometric;
    const outputs = new Outputs(session);

    expect(psychrometricLayersOf(outputs.chart?.traces ?? [])).toEqual([
      "fill",
      "isoline",
      "line",
      "hoverGrid",
      "cover",
      "saturationLine",
      "point",
    ]);
    expect(markedPositions(outputs.chart)).toEqual([0, 1, 2]);

    openAt(session, page.explore);
    expect(psychrometricLayersOf(outputs.chart?.traces ?? [])).toEqual([
      "fill",
      "isoline",
      "line",
      "hoverGrid",
      "cover",
      "saturationLine",
      "point",
    ]);
  });

  describe("on Explore", () => {
    it("paints the current model's Band list on the dynamic chart over slot 1, with Compare on or off", () => {
      const session = sessionComparingThreeSlots(pmvPpdIso);
      heldSlot(session, 1).setEntered(q.tdb, 28);
      session.chart.type = chartType.dynamic;
      const outputs = new Outputs(session);
      openAt(session, page.explore);

      for (const compare of [true, false]) {
        session.setCompare(compare);
        const list = session.chart.bands;
        const traces = outputs.chart?.traces ?? [];
        const bands = fillsOf(traces);
        expect(list).toEqual(bandListOf(pmvPpdIso.scan.classifier));
        expect(bands.map((band) => [band.label, band.fill])).toEqual(list?.labels.map((label, index) => [label, list.colors[index]]));
        if (list) {
          expectContiguousFills(traces, list, outputs.slots[0].scan.values);
          expectEdgesCrossed(traces, list, outputs.slots[0].scan.values);
        }
        expect(markedPositions(outputs.chart)).toEqual([0]);
      }
    });

    it("paints the current model's Band list on the psychrometric chart over slot 1's scan, the cover above it, and no zone", () => {
      const session = sessionComparingThreeSlots(pmvPpdIso);
      session.chart.type = chartType.psychrometric;
      const outputs = new Outputs(session);
      const zones = () => zoneLinesOf({ traces: outputs.chart?.traces ?? [] });
      const covers = () => (outputs.chart?.traces ?? []).filter((trace) => trace.kind === "path" && trace.fill === chartInk.ground);
      expect(zones()).toHaveLength(12);
      expect(covers()).toHaveLength(1);
      openAt(session, page.explore);

      const list = session.chart.bands;
      const traces = outputs.chart?.traces ?? [];
      const bands = fillsOf(traces);
      const { values } = outputs.slots[0].scan;
      expect(bands.map((band) => [band.label, band.fill])).toEqual(list?.labels.map((label, index) => [label, list.colors[index]]));
      expect(values.flat().every((value) => Number.isFinite(value))).toBe(true);
      if (list) {
        expectContiguousFills(traces, list, values);
        expectEdgesCrossed(traces, list, values);
      }
      expect(zones()).toHaveLength(0);
      expect(traces.indexOf(covers()[0])).toBeGreaterThan(traces.indexOf(bands[bands.length - 1]));
      expect(markedPositions(outputs.chart)).toEqual([0]);
    });

    it("moves the psychrometric chart's boundary and its line with an Edge, on the same scan", () => {
      const session = new Session(pmvPpdIso);
      session.chart.type = chartType.psychrometric;
      const outputs = new Outputs(session);
      openAt(session, page.explore);
      const scan = outputs.slots[0].scan;

      editBands(session, (draft) => draft.moveEdge(2, -0.1));
      const list = session.chart.bands;
      expect(list?.edges[2]).toBe(-0.1);
      if (list) {
        expectContiguousFills(outputs.chart?.traces ?? [], list, scan.values);
        expectEdgesCrossed(outputs.chart?.traces ?? [], list, scan.values);
      }
      expect(outputs.slots[0].scan).toBe(scan);
    });

    it("paints Adaptive's Comfort zones, which have no Band list", () => {
      const session = new Session(pmvPpdIso);
      openAt(session, page.explore, adaptiveAshrae);

      expect(session.chart.bands).toBeNull();
      const traces = new Outputs(session).chart?.traces ?? [];
      expect(zoneFillsOf({ traces }).length).toBeGreaterThan(0);
      expect(linesOf(traces)).toEqual([]);
    });

    it("keeps each model's Band list, the same object, across a switch and back", () => {
      const session = new Session(pmvPpdIso);
      openAt(session, page.explore);
      const iso = session.chart.bands;
      session.requestModel(pmvPpdAshrae);
      expect(session.model).toBe(pmvPpdAshrae);
      const ashrae = session.chart.bands;
      expect(ashrae).not.toBe(iso);
      session.requestModel(pmvPpdIso);

      expect(session.model).toBe(pmvPpdIso);
      expect(iso?.labels).toHaveLength(7);
      expect(session.chart.bands).toBe(iso);
      session.requestModel(pmvPpdAshrae);
      expect(session.chart.bands).toBe(ashrae);
    });

    for (const type of [chartType.psychrometric, chartType.dynamic]) {
      it(`asks about slot 1 alone and draws its ${type.title.toLowerCase()} chart alone, with Compare on or off`, () => {
        const session = sessionComparingThreeSlots(pmvPpdIso);
        heldSlot(session, 1).setEntered(q.tdb, 28);
        session.chart.type = type;
        const outputs = new Outputs(session);
        expect(markedPositions(outputs.chart)).toEqual([0, 1, 2]);

        openAt(session, page.explore);
        expect(outputs.slots.map((slot) => slot.position)).toEqual([0]);
        expect(markedPositions(outputs.chart)).toEqual([0]);

        session.setCompare(false);
        expect(outputs.slots.map((slot) => slot.position)).toEqual([0]);
        expect(markedPositions(outputs.chart)).toEqual([0]);
      });
    }
  });

  it("holds Compare, the enabled slots, their values and the chart settings through Explore and back", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    session.setSlotEnabled(2, false);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    session.chart.type = chartType.dynamic;
    session.chart.setAxes({ y: q.vr });
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));
    const chart = session.chart;
    const outputs = new Outputs(session);

    openAt(session, page.explore);
    openAt(session, page.standard);

    expect(session.compare).toBe(true);
    expect(slotPositions.map((position) => session.isSlotEnabled(position))).toEqual([true, true, false]);
    expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(before);
    expect(session.chart).toBe(chart);
    expect(session.chart.axes?.y).toBe(q.vr);
    expect(outputs.slots.map((slot) => slot.position)).toEqual([0, 1]);
    expect(markedPositions(outputs.chart)).toEqual([0, 1]);
  });

  it("answers a question held on the Standard page with a no when the address moves to Explore on the same model", () => {
    const session = new Session(pmvPpdIso);
    session.slots[0].setEntered(q.tdb, 20);
    session.requestModel(heatIndexRothfusz);
    expect(session.pendingSwitch).not.toBeNull();

    openAt(session, page.explore);

    expect(session.pendingSwitch).toBeNull();
    expect(session.model).toBe(pmvPpdIso);
    expect(heldSlot(session, 0).values.get(q.tdb)).toBe(20);
  });

  it("holds Compare's slots through a trip to a model with no standard and back", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    // Inside both models' dry-bulb bounds, so neither arrival cuts, and slot 2 holds its own.
    for (const position of slotPositions) {
      heldSlot(session, position).setEntered(q.tdb, 27.5);
    }
    heldSlot(session, 1).setEntered(q.tdb, 28);
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));

    openAt(session, page.explore, heatIndexRothfusz);
    openAt(session, page.standard, pmvPpdIso);

    expect(session.compare).toBe(true);
    expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(before);
  });
});
