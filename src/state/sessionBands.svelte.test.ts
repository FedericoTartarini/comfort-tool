/**
 * The Bands dialog's edits (ADR-0002 decision 59, and decision 84, rule 6),
 * asserted at the seam the other session tests use: a session on Explore,
 * edited through a draft of its Band list as the dialog edits it and applied
 * as its Apply applies it, its Band list and its chart spec out, with no
 * component and no router. The expected lists are the Band list module's own
 * operations on the default list, and a list's lines are its own Edges.
 */
import { describe, expect, it } from "vitest";
import { addEdge, bandListOf, moveEdge, removeEdge, setColor, setLabel, type BandList } from "$lib/core/bands";
import { bandFillsOf, bandLinesOf, heldBetween, numbersAlong, regionOf, zoneFillsOf, zoneLinesOf } from "$lib/core/charts/chartTestPaths";
import { chartType, type ChartType } from "$lib/core/chartType";
import { page } from "$lib/core/page";
import { pmvPpdAshrae } from "$lib/models/pmvPpdAshrae";
import { pmvPpdIso } from "$lib/models/pmvPpdIso";
import { copy } from "$lib/text/copy";
import { Outputs } from "./compute.svelte";
import type { BandListDraft } from "./bandListDraft.svelte";
import { Session } from "./session.svelte";
import { bandsDraftOf } from "./sessionTestReaders";

const sensation = pmvPpdIso.scan.classifier;
// Thermal sensation's Edges: -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 10; band 3 is Neutral.
const defaultList = bandListOf(sensation);

/** A session on Explore on PMV (ISO 7730)'s `type` chart, the dynamic one unless named, and its outputs. */
function exploreSession(type: ChartType = chartType.dynamic): { session: Session; outputs: Outputs } {
  const session = new Session(pmvPpdIso);
  session.setAddress({ page: page.explore, model: pmvPpdIso });
  session.chart.type = type;
  return { session, outputs: new Outputs(session) };
}

/**
 * Where the chart strokes an Edge: each band line's label, and whether it
 * runs where slot 1's scanned number crosses `list`'s Edge of the same band.
 */
function strokedEdges(outputs: Outputs, list: BandList) {
  const spec = { traces: outputs.chart?.traces ?? [] };
  return bandLinesOf(spec).map((line, index) => ({
    label: line.label,
    onEdge: numbersAlong(spec, line, outputs.slots[0].scan.values).every((number) => Math.abs(number - list.edges[index]) < 1e-9),
  }));
}

/** A band's `label` as the chart names it: an empty one, as Add leaves it, reads "Unlabelled band". */
function shownLabel(label: string): string {
  return label === "" ? copy.unlabelledBand : label;
}

/** The Edges `list` strokes: every band's own upper Edge, painted or not. */
function edgesOf(list: BandList) {
  return list.labels.map((label) => ({ label: shownLabel(label), onEdge: true }));
}

/** The fills the chart paints: each one's label, colour, and the grid points of the scan it holds. */
function paintedFills(outputs: Outputs) {
  const spec = { traces: outputs.chart?.traces ?? [] };
  return bandFillsOf(spec).map((fill) => ({ label: fill.label, color: fill.fill, held: regionOf(spec, fill) }));
}

/**
 * The fills `list` implies over slot 1's scan in `outputs`: a coloured band
 * from the Edge below it up to the Edge of the last band of the coloured run
 * it starts, which an uncoloured band or the list's end closes, holding the
 * grid points whose number lies in that interval.
 */
function fillsOf(list: BandList, outputs: Outputs) {
  const { values } = outputs.slots[0].scan;
  return list.labels.flatMap((label, index) => {
    const color = list.colors[index];
    const closing = list.colors.findIndex((above, position) => position > index && above === undefined);
    const top = closing === -1 ? list.edges.length - 1 : closing - 1;
    const held = heldBetween(values, { lower: list.edges[index - 1], upper: list.edges[top] }, list.right);
    return color === undefined ? [] : [{ label: shownLabel(label), color, held }];
  });
}

const edits: readonly { name: string; edit: (draft: BandListDraft) => void; expected: BandList }[] = [
  { name: "moves an Edge", edit: (draft) => draft.moveEdge(3, 0.7), expected: moveEdge(defaultList, 3, 0.7) },
  { name: "adds a band", edit: (draft) => draft.addBand(3), expected: addEdge(defaultList, 3, sensation) },
  { name: "removes a band", edit: (draft) => draft.removeBand(3), expected: removeEdge(defaultList, 3) },
  { name: "relabels a band", edit: (draft) => draft.setLabel(3, "Fine"), expected: setLabel(defaultList, 3, "Fine") },
  {
    name: "recolours a band",
    edit: (draft) => draft.setColor(3, "#123456"),
    expected: setColor(defaultList, 3, "#123456"),
  },
  {
    name: "clears a band's colour",
    edit: (draft) => draft.setColor(3, undefined),
    expected: setColor(defaultList, 3, undefined),
  },
];

describe("The Bands dialog's edits through a draft of the Band list", () => {
  for (const type of [chartType.dynamic, chartType.psychrometric]) {
    for (const { name, edit, expected } of edits) {
      it(`${name} in the draft alone, and Apply writes it to the current model's Band list and the ${type.title} chart's spec, rescanning nothing`, () => {
        const { session, outputs } = exploreSession(type);
        expect(paintedFills(outputs)).toEqual(fillsOf(defaultList, outputs));
        expect(strokedEdges(outputs, defaultList)).toEqual(edgesOf(defaultList));
        const { result, scan } = outputs.slots[0];
        const list = session.chart.bands;
        const spec = outputs.chart;
        const draft = bandsDraftOf(session);

        edit(draft);

        expect(draft.bands).toEqual(expected);
        // The chart never reads the draft.
        expect(session.chart.bands).toBe(list);
        expect(outputs.chart).toBe(spec);

        draft.apply();

        expect(session.chart.bands).toEqual(expected);
        expect(paintedFills(outputs)).toEqual(fillsOf(expected, outputs));
        expect(strokedEdges(outputs, expected)).toEqual(edgesOf(expected));
        expect(outputs.slots[0].scan).toBe(scan);
        // The result table reads the kernel's own category, never the list.
        expect(outputs.slots[0].result).toEqual(result);
      });
    }
  }

  it("leaves the Band list as it was when the draft is discarded, and the next draft starts from it", () => {
    const { session, outputs } = exploreSession();
    const spec = outputs.chart;
    const discarded = bandsDraftOf(session);
    discarded.setLabel(3, "Fine");
    discarded.addBand(2);
    discarded.moveEdge(0, -3);

    expect(session.chart.bands).toEqual(defaultList);
    expect(outputs.chart).toBe(spec);
    expect(bandsDraftOf(session).bands).toEqual(defaultList);
  });

  it("starts a draft from the applied list, not the default", () => {
    const { session } = exploreSession();
    const first = bandsDraftOf(session);
    first.setLabel(3, "Fine");
    first.apply();

    expect(bandsDraftOf(session).bands).toEqual(setLabel(defaultList, 3, "Fine"));
  });

  it("resets the draft alone to the list the model starts on, and Apply writes the reset", () => {
    const { session, outputs } = exploreSession();
    const edited = bandsDraftOf(session);
    edited.addBand(3);
    edited.setColor(0, undefined);
    edited.moveEdge(6, 4);
    edited.apply();
    const list = session.chart.bands;
    const draft = bandsDraftOf(session);

    draft.reset();

    expect(draft.bands).toEqual(defaultList);
    expect(session.chart.bands).toBe(list);

    draft.apply();

    expect(session.chart.bands).toEqual(defaultList);
    expect(paintedFills(outputs)).toEqual(fillsOf(defaultList, outputs));
  });

  it("refuses an Edge at or beyond a neighbour, the draft as it was, and says which Edges it must fall between", () => {
    const { session } = exploreSession();
    const draft = bandsDraftOf(session);
    const list = draft.bands;

    for (const edge of [2, 1.5, -0.5, -1]) {
      expect(draft.isInOrder(3, edge)).toBe(false);
      draft.moveEdge(3, edge);
      expect(draft.bands).toBe(list);
      expect(draft.refusalAt(3)).toEqual({ edge, below: -0.5, above: 1.5 });
    }
    expect(draft.isInOrder(3, 0.7)).toBe(true);
    expect(draft.refusalAt(2)).toBeUndefined();
  });

  it("says the first Edge has none below and the last none above", () => {
    const draft = bandsDraftOf(exploreSession().session);

    draft.moveEdge(0, -1);
    draft.moveEdge(6, 2);

    expect(draft.refusalAt(0)).toEqual({ edge: -1, below: undefined, above: -1.5 });
    expect(draft.refusalAt(6)).toEqual({ edge: 2, below: 2.5, above: undefined });
  });

  it("keeps an Edge's refusal until that Edge is next moved, through another Edge's moves and a band's label and colour", () => {
    const draft = bandsDraftOf(exploreSession().session);
    draft.moveEdge(3, 2);
    draft.moveEdge(1, -3);

    draft.moveEdge(4, 1.4);
    draft.setLabel(3, "Fine");
    draft.setColor(3, undefined);
    expect(draft.refusalAt(3)).toEqual({ edge: 2, below: -0.5, above: 1.5 });
    expect(draft.refusalAt(1)).toEqual({ edge: -3, below: -2.5, above: -0.5 });

    draft.moveEdge(3, 0.7);
    expect(draft.refusalAt(3)).toBeUndefined();
    expect(draft.refusalAt(1)).toBeDefined();
  });

  it("drops an Edge's refusal once a new value is typed in its box, the list and the other refusals as they were", () => {
    const draft = bandsDraftOf(exploreSession().session);
    draft.moveEdge(3, 2);
    draft.moveEdge(1, -3);
    const list = draft.bands;

    draft.startTypingEdge(3);

    expect(draft.refusalAt(3)).toBeUndefined();
    expect(draft.refusalAt(1)).toEqual({ edge: -3, below: -2.5, above: -0.5 });
    expect(draft.bands).toBe(list);
  });

  it("drops every refusal on Add, Remove and Reset, which move the Edges' places", () => {
    for (const edit of [(draft: BandListDraft) => draft.addBand(5), (draft: BandListDraft) => draft.removeBand(5), (draft: BandListDraft) => draft.reset()]) {
      const draft = bandsDraftOf(exploreSession().session);
      draft.moveEdge(3, 2);

      edit(draft);

      expect(draft.refusalAt(3)).toBeUndefined();
    }
  });

  it("leaves the Standard page's dynamic chart to its Comfort zones, whatever the list holds", () => {
    const { session, outputs } = exploreSession();
    const draft = bandsDraftOf(session);
    draft.setLabel(3, "Fine");
    draft.addBand(2);
    draft.apply();

    session.setAddress({ page: page.standard, model: pmvPpdIso });
    const traces = outputs.chart?.traces ?? [];

    expect(zoneFillsOf({ traces }).map((fill) => fill.label)).toEqual(
      [...pmvPpdIso.scan.comfortZones].sort((a, b) => b.limit - a.limit).map((zone) => copy.zoneLegend(zone)),
    );
    expect(zoneLinesOf({ traces })).toHaveLength(4);
    expect(paintedFills(outputs)).toEqual([]);
    expect(strokedEdges(outputs, defaultList)).toEqual([]);
  });

  it("keeps an applied list across a model switch and back, and the other model's list its own", () => {
    const { session, outputs } = exploreSession();
    const draft = bandsDraftOf(session);
    draft.setLabel(3, "Fine");
    draft.apply();
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
