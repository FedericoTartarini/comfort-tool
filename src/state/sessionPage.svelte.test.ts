/**
 * The page a session is on (ADR-0002 decision 57): one session serves every
 * page, and the address sets the page as it sets the model. Asserted at the
 * seam the other session tests use — a session in, its state and its outputs
 * out, with no component and no router — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives. The page is set as the address sets it.
 */
import { describe, expect, it } from "vitest";
import { bandListOf } from "$lib/core/bands";
import { chartInk } from "$lib/core/bandPalette";
import type { ChartSpec, ContourFillTrace, ContourLineTrace, PointTrace, Trace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Page } from "$lib/core/page";
import { quantities } from "$lib/core/quantities";
import { slotBadges } from "$lib/core/slotBadge";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions, type SlotPosition } from "./session.svelte";
import { heldSlot, resultValueOf, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;

/** The positions of the slots whose markers `chart` draws, in slot order. */
function markedPositions(chart: ChartSpec | null): SlotPosition[] {
  const markers = (chart?.traces ?? []).filter((trace): trace is PointTrace => trace.kind === "point");
  return slotPositions.filter((position) => markers.some((marker) => marker.color === chartInk.marker(slotBadges[position].hue)));
}

/** The fills among `traces`, a Comfort zone's or a Band's, in drawing order. */
function fillsOf(traces: readonly Trace[]): ContourFillTrace[] {
  return traces.filter((trace): trace is ContourFillTrace => trace.kind === "contourFill");
}

/** The lines among `traces`, a Comfort zone's outline or a Band's Edge, in drawing order. */
function linesOf(traces: readonly Trace[]): ContourLineTrace[] {
  return traces.filter((trace): trace is ContourLineTrace => trace.kind === "contourLine");
}

/**
 * The layers of the psychrometric chart's `traces` in drawing order, each run
 * of one layer named once: a trace's kind, or for a path, which of the
 * isolines, the cover and the saturation line it is.
 */
function psychrometricLayersOf(traces: readonly Trace[]): string[] {
  const layerOf = (trace: Trace) => {
    if (trace.kind !== "path") {
      return trace.kind;
    }
    if (trace.fill === chartInk.ground) {
      return "cover";
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
    // Inside Heat Index's bound, which the address's path does not move a value to.
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
    expect(fillsOf(traces)).toHaveLength(3);
    expect(traces.filter((trace) => trace.kind === "contourLine")).toHaveLength(3);
  });

  it("paints each drawn slot's Comfort zones on the Standard page's psychrometric chart over its own scan, Compare off and on, read by a hover grid", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    session.chart.type = chartType.psychrometric;
    const outputs = new Outputs(session);

    for (const compare of [false, true]) {
      session.setCompare(compare);
      const traces = outputs.chart?.traces ?? [];
      const fills = fillsOf(traces);
      const lines = linesOf(traces);
      expect(fills).toHaveLength(3 * outputs.slots.length);
      expect(lines).toHaveLength(3 * outputs.slots.length);
      outputs.slots.forEach((slot, position) => {
        expect(fills.slice(3 * position, 3 * position + 3).map((fill) => fill.z)).toEqual([slot.scan, slot.scan, slot.scan]);
        expect(lines.slice(3 * position, 3 * position + 3).map((line) => line.z)).toEqual([slot.scan, slot.scan, slot.scan]);
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
      "contourFill",
      "isoline",
      "contourLine",
      "hoverGrid",
      "cover",
      "saturationLine",
      "point",
    ]);
    expect(markedPositions(outputs.chart)).toEqual([0, 1, 2]);

    openAt(session, page.explore);
    expect(psychrometricLayersOf(outputs.chart?.traces ?? [])).toEqual([
      "contourFill",
      "isoline",
      "contourLine",
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
        expect(bands.map((band) => [band.label, band.color])).toEqual(list?.labels.map((label, index) => [label, list.colors[index]]));
        expect(bands.map((band) => band.z)).toEqual(bands.map(() => outputs.slots[0].scan));
        expect(linesOf(traces).map((line) => [line.color, line.upper, line.z])).toEqual(
          list?.edges.map((edge) => [chartInk.bandLine, edge, outputs.slots[0].scan]),
        );
        expect(markedPositions(outputs.chart)).toEqual([0]);
      }
    });

    it("paints the current model's Band list on the psychrometric chart over slot 1's scan, the cover above it, and no zone", () => {
      const session = sessionComparingThreeSlots(pmvPpdIso);
      session.chart.type = chartType.psychrometric;
      const outputs = new Outputs(session);
      // A zone strokes its outline in its slot's zone line, a band its Edge in the band line.
      const zones = () => linesOf(outputs.chart?.traces ?? []).filter((line) => line.color !== chartInk.bandLine);
      const covers = () => (outputs.chart?.traces ?? []).filter((trace) => trace.kind === "path" && trace.fill === chartInk.ground);
      expect(zones()).toHaveLength(9);
      expect(covers()).toHaveLength(1);
      openAt(session, page.explore);

      const list = session.chart.bands;
      const bands = fillsOf(outputs.chart?.traces ?? []);
      expect(bands.map((band) => [band.label, band.color])).toEqual(list?.labels.map((label, index) => [label, list.colors[index]]));
      expect(bands.map((band) => band.z)).toEqual(bands.map(() => outputs.slots[0].scan));
      expect(bands[0].z.flat()).not.toContain(null);
      expect(zones()).toHaveLength(0);
      expect(linesOf(outputs.chart?.traces ?? []).map((line) => line.upper)).toEqual(list?.edges);
      const traces = outputs.chart?.traces ?? [];
      expect(traces.indexOf(covers()[0])).toBeGreaterThan(traces.indexOf(bands[bands.length - 1]));
      expect(markedPositions(outputs.chart)).toEqual([0]);
    });

    it("moves the psychrometric chart's boundary and its line with an Edge, on the same scan", () => {
      const session = new Session(pmvPpdIso);
      session.chart.type = chartType.psychrometric;
      const outputs = new Outputs(session);
      openAt(session, page.explore);
      const scan = outputs.slots[0].scan;

      expect(session.chart.moveBandEdge(2, -0.1)).toBe(true);
      const edges = session.chart.bands?.edges ?? [];
      expect(fillsOf(outputs.chart?.traces ?? []).map((band) => band.lower)).toEqual([undefined, ...edges.slice(0, -1)]);
      expect(linesOf(outputs.chart?.traces ?? []).map((line) => line.upper)).toEqual(edges);
      expect(outputs.slots[0].scan).toBe(scan);
    });

    it("paints Adaptive's Comfort zones, which have no Band list", () => {
      const session = new Session(pmvPpdIso);
      openAt(session, page.explore, adaptiveAshrae);

      expect(session.chart.bands).toBeNull();
      expect(new Outputs(session).chart?.traces.some((trace) => trace.kind === "contourFill" || trace.kind === "contourLine")).toBe(false);
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
    heldSlot(session, 1).setEntered(q.tdb, 28);
    const before = slotPositions.map((position) => shapeOf(heldSlot(session, position)));

    openAt(session, page.explore, heatIndexRothfusz);
    openAt(session, page.standard, pmvPpdIso);

    expect(session.compare).toBe(true);
    expect(slotPositions.map((position) => shapeOf(heldSlot(session, position)))).toEqual(before);
  });
});
