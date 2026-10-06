/**
 * The chart on screen is the model's declared chart of the session's chart
 * type, built by that type's builder, and scanned only when the type scans
 * (ADR-0002 decisions 61 and 62). Asserted at the seam the other session
 * tests use — a session in, its outputs out, with no component and no router
 * — against the builders' own spec of the same slots, so no trace is written
 * here.
 */
import { describe, expect, it } from "vitest";
import { adaptiveSpec } from "$lib/core/charts/adaptiveChart";
import type { ChartRequest } from "$lib/core/charts/chartRequest";
import type { PathTrace } from "$lib/core/charts/chartSpec";
import { chartRequestForSlots } from "$lib/core/charts/chartTestRequests";
import { dynamicAxisQuantities, dynamicScanFrameFor, dynamicSpec, resolvedAxes } from "$lib/core/charts/dynamicChart";
import { psychrometricSpec } from "$lib/core/charts/psychrometricChart";
import { scannedField } from "$lib/core/charts/specParts";
import { chartType } from "$lib/core/chartType";
import type { ChartAxes } from "$lib/core/modelDeclaration";
import { page, type Page } from "$lib/core/page";
import { quantities } from "$lib/core/quantities";
import { adaptiveAshrae } from "$lib/models/adaptiveAshrae";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session } from "./session.svelte";
import { heldSlot, sessionComparingThreeSlots } from "./sessionTestReaders";

const q = quantities;

/** `session` sent to `target` and its model, as the address sends it. */
function openAt(session: Session, target: Page): void {
  session.setAddress({ page: target, model: session.model });
}

/** What `outputs` draw: every compared slot's last valid run, painting the Band list on Explore. */
function requestOf(session: Session, outputs: Outputs): ChartRequest {
  const slots = outputs.slots.map((slot) => {
    if (!slot.lastValid) {
      throw new Error(`${slot.badge.name} has no run`);
    }
    return slot.lastValid.slot;
  });
  return { ...chartRequestForSlots(session.model, slots), bands: session.page === page.explore ? session.chart.bands : null };
}

/** The session's picked axes, which a session on a model with a dynamic chart holds. */
function pickedAxesOf(session: Session): ChartAxes {
  const axes = session.chart.axes;
  if (!axes) {
    throw new Error(`${session.model.info.label} holds no picked axes`);
  }
  return axes;
}

describe("a session on Adaptive", () => {
  for (const target of [page.standard, page.explore]) {
    for (const compare of [false, true]) {
      it(`gives the adaptive chart on ${target.title}, Compare ${compare ? "on" : "off"}, scanning nothing and offering no axes`, () => {
        const session = sessionComparingThreeSlots(adaptiveAshrae);
        heldSlot(session, 1).setEntered(q.v, 0.9);
        session.setCompare(compare);
        openAt(session, target);
        const outputs = new Outputs(session);

        expect(session.chart.type).toBe(chartType.adaptive);
        expect(outputs.slots).toHaveLength(compare && target === page.standard ? 3 : 1);
        expect(outputs.chart).toEqual(adaptiveSpec(requestOf(session, outputs)));
        for (const slot of outputs.slots) {
          expect(() => slot.scan).toThrow(slot.badge.name);
        }
        expect(outputs.drawnAxes).toBeNull();
      });

      it(`draws each Comfort zone as a fill and two lines in its slot's hue on ${target.title}, Compare ${compare ? "on" : "off"}`, () => {
        const session = sessionComparingThreeSlots(adaptiveAshrae);
        heldSlot(session, 1).setEntered(q.v, 0.9);
        session.setCompare(compare);
        openAt(session, target);
        const outputs = new Outputs(session);

        const paths = (outputs.chart?.traces ?? []).filter((trace): trace is PathTrace => trace.kind === "path");
        let drawn = 0;
        for (const { badge } of outputs.slots) {
          const fills = paths.filter((path) => path.fill?.includes(badge.hue.zoneFillRgb));
          const lines = paths.filter((path) => path.fill === undefined && path.color === badge.hue.zoneLine);
          expect(fills.length).toBeGreaterThan(0);
          expect(fills.map((fill) => fill.width)).toEqual(fills.map(() => 0));
          expect(lines).toHaveLength(2 * fills.length);
          drawn += fills.length + lines.length;
        }
        expect(paths).toHaveLength(drawn);
      });
    }
  }
});

describe("a session on a model with a scan", () => {
  it("gives PMV (ISO 7730)'s psychrometric chart while it is on screen, offering no axes", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    session.chart.type = chartType.psychrometric;
    const outputs = new Outputs(session);

    expect(outputs.chart).toEqual(psychrometricSpec(requestOf(session, outputs)));
    expect(outputs.drawnAxes).toBeNull();
  });

  it("gives PMV (ISO 7730)'s dynamic chart while it is on screen, on the picked axes, and offers them", () => {
    const session = sessionComparingThreeSlots(pmvPpdIso);
    heldSlot(session, 1).setEntered(q.tdb, 28);
    session.chart.type = chartType.dynamic;
    session.chart.setAxes({ y: q.rh });
    const outputs = new Outputs(session);
    const axes = pickedAxesOf(session);

    expect(outputs.chart).toEqual(dynamicSpec(requestOf(session, outputs), axes));
    expect(outputs.drawnAxes).toEqual({
      choices: dynamicAxisQuantities(pmvPpdIso, session.entryModes),
      selected: resolvedAxes(pmvPpdIso, axes, session.entryModes),
    });
  });

  it("gives Heat Index's one chart, the dynamic chart, with its Band list on Explore, and offers its axes", () => {
    const session = new Session(heatIndexRothfusz);
    openAt(session, page.explore);
    const outputs = new Outputs(session);
    const axes = pickedAxesOf(session);

    expect(session.chart.type).toBe(chartType.dynamic);
    expect(outputs.chart).toEqual(dynamicSpec(requestOf(session, outputs), axes));
    const [last] = requestOf(session, outputs).slots;
    expect(outputs.slots[0].scan).toEqual(
      scannedField(dynamicScanFrameFor(heatIndexRothfusz, axes, session.entryModes, session.atmosphericPressure), last.slot),
    );
    // The two quantities Heat Index takes, both with an axis range.
    expect(outputs.drawnAxes?.choices).toEqual([q.tdb, q.rh]);
  });
});

describe("a switch from a PMV model to Adaptive and back", () => {
  it("leaves each model its own chart type and axes", () => {
    const session = new Session(pmvPpdIso);
    const outputs = new Outputs(session);
    session.chart.type = chartType.dynamic;
    session.chart.setAxes({ y: q.rh });

    session.setModel(adaptiveAshrae);

    expect(session.chart.type).toBe(chartType.adaptive);
    expect(session.chart.axes).toBeNull();
    expect(outputs.chart?.layout.x.title).toContain(q.t_running_mean.label);
    expect(outputs.drawnAxes).toBeNull();

    session.setModel(pmvPpdIso);

    expect(session.chart.type).toBe(chartType.dynamic);
    expect(session.chart.axes).toEqual({ x: q.tdb, y: q.rh });
    expect(outputs.drawnAxes?.selected).toEqual({ x: q.tdb, y: q.rh });
  });
});
