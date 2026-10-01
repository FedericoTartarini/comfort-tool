/**
 * The page a session is on (ADR-0002 decision 57): one session serves every
 * page, and the address sets the page as it sets the model. Asserted at the
 * seam the other session tests use — a session in, its state and its outputs
 * out, with no component and no router — and nothing flushes, for the reason
 * `compute.svelte.test.ts` gives. The page is set as the address sets it.
 */
import { describe, expect, it } from "vitest";
import type { ChartSpec, PointTrace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Page } from "$lib/core/page";
import { quantities } from "$lib/core/quantities";
import { slotBadges } from "$lib/core/slotBadge";
import { heatIndexRothfusz } from "$lib/models/heatIndexRothfusz";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, slotPositions, type SlotPosition } from "./session.svelte";
import { heldSlot, resultValueOf, sessionComparingThreeSlots, shapeOf } from "./sessionTestReaders";

const q = quantities;

/** The positions of the slots whose markers `chart` draws, in slot order. */
function markedPositions(chart: ChartSpec | null): SlotPosition[] {
  const markers = (chart?.traces ?? []).filter((trace): trace is PointTrace => trace.kind === "point");
  return slotPositions.filter((position) => markers.some((marker) => marker.color === slotBadges[position].hue.marker));
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

  describe("on Explore", () => {
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
    expect(session.chart.axes.y).toBe(q.vr);
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
