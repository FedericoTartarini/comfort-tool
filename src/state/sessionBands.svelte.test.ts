/**
 * The Bands panel's edits (ADR-0002 decision 59), asserted at the seam the
 * other session tests use: a session on Explore, edited through its chart
 * settings as the panel edits it, its Band list and its chart spec out, with
 * no component and no router. The expected lists are the Band list module's
 * own operations on the default list.
 */
import { describe, expect, it } from "vitest";
import { addEdge, bandListOf, moveEdge, removeEdge, setColor, setLabel, type BandList } from "$lib/core/bands";
import type { BandFill, BandTrace } from "$lib/core/charts/chartSpec";
import { chartType } from "$lib/core/chartType";
import { page } from "$lib/core/page";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { Outputs } from "./compute.svelte";
import { Session, type ChartState } from "./session.svelte";

const sensation = pmvPpdIso.scan.classifier;
// Thermal sensation's Edges: -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 10; band 3 is Neutral.
const defaultList = bandListOf(sensation);

/** A session on Explore on PMV (ISO 7730)'s dynamic chart, and its outputs. */
function exploreSession(): { session: Session; outputs: Outputs } {
  const session = new Session(pmvPpdIso);
  session.setAddress({ page: page.explore, model: pmvPpdIso });
  session.chart.type = chartType.dynamic;
  return { session, outputs: new Outputs(session) };
}

/** The fills the chart's one band trace paints. */
function paintedFills(outputs: Outputs): readonly BandFill[] {
  const traces = (outputs.chart?.traces ?? []).filter((trace): trace is BandTrace => trace.kind === "bands");
  expect(traces).toHaveLength(1);
  return traces[0].bands;
}

/** The fills `list` implies: a coloured band over its Edge and the one below. */
function fillsOf(list: BandList): BandFill[] {
  return list.labels.flatMap((label, index) => {
    const color = list.colors[index];
    return color === undefined ? [] : [{ label, color, upper: list.edges[index], lower: list.edges[index - 1] }];
  });
}

const edits: readonly { name: string; edit: (chart: ChartState) => void; expected: BandList }[] = [
  { name: "moves an Edge", edit: (chart) => chart.moveBandEdge(3, 0.7), expected: moveEdge(defaultList, 3, 0.7) },
  { name: "adds a band", edit: (chart) => chart.addBand(3), expected: addEdge(defaultList, 3, sensation) },
  { name: "removes a band", edit: (chart) => chart.removeBand(3), expected: removeEdge(defaultList, 3) },
  { name: "relabels a band", edit: (chart) => chart.setBandLabel(3, "Fine"), expected: setLabel(defaultList, 3, "Fine") },
  {
    name: "recolours a band",
    edit: (chart) => chart.setBandColor(3, "#123456"),
    expected: setColor(defaultList, 3, "#123456"),
  },
  {
    name: "clears a band's colour",
    edit: (chart) => chart.setBandColor(3, undefined),
    expected: setColor(defaultList, 3, undefined),
  },
];

describe("The Bands panel's edits through the session", () => {
  for (const { name, edit, expected } of edits) {
    it(`${name} in the current model's Band list and the chart spec at once`, () => {
      const { session, outputs } = exploreSession();
      expect(paintedFills(outputs)).toEqual(fillsOf(defaultList));
      const result = outputs.slots[0].result;

      edit(session.chart);

      expect(session.chart.bands).toEqual(expected);
      expect(paintedFills(outputs)).toEqual(fillsOf(expected));
      // The result table reads the kernel's own category, never the list.
      expect(outputs.slots[0].result).toEqual(result);
    });
  }

  it("leaves the Standard page's dynamic chart to its Comfort zones, whatever the list holds", () => {
    const { session, outputs } = exploreSession();
    session.chart.setBandLabel(3, "Fine");
    session.chart.addBand(2);

    session.setAddress({ page: page.standard, model: pmvPpdIso });
    const traces = outputs.chart?.traces ?? [];

    expect(traces.some((trace) => trace.kind === "bands")).toBe(false);
    expect(traces.filter((trace) => trace.kind === "contourZone")).toHaveLength(3);
  });

  it("refuses an Edge at or beyond a neighbour, leaving the list and the spec as they were", () => {
    const { session, outputs } = exploreSession();
    const list = session.chart.bands;
    const spec = outputs.chart;

    for (const edge of [2, 1.5, -0.5, -1]) {
      expect(session.chart.moveBandEdge(3, edge)).toBe(false);
    }

    expect(session.chart.bands).toBe(list);
    expect(outputs.chart).toBe(spec);
    expect(session.chart.moveBandEdge(3, 0.7)).toBe(true);
  });

  it("returns the default list on Reset", () => {
    const { session, outputs } = exploreSession();
    session.chart.addBand(3);
    session.chart.setBandColor(0, undefined);
    session.chart.moveBandEdge(6, 4);

    session.chart.resetBands();

    expect(session.chart.bands).toEqual(defaultList);
    expect(paintedFills(outputs)).toEqual(fillsOf(defaultList));
  });

  it("keeps an edited list across a model switch and back, and the other model's list its own", () => {
    const { session, outputs } = exploreSession();
    session.chart.setBandLabel(3, "Fine");
    const edited = session.chart.bands;

    session.requestModel(pmvPpdAshrae);
    expect(session.model).toBe(pmvPpdAshrae);
    expect(session.chart.bands).toEqual(bandListOf(pmvPpdAshrae.scan.classifier));
    session.requestModel(pmvPpdIso);

    expect(session.model).toBe(pmvPpdIso);
    expect(session.chart.bands).toBe(edited);
    expect(paintedFills(outputs).map((fill) => fill.label)).toContain("Fine");
  });
});
