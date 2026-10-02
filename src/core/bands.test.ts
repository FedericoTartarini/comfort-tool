import { describe, expect, it } from "vitest";
import { classifyFromBins, PMV_THERMAL_SENSATION_VOTE_BINS_ISO } from "jsthermalcomfort";
import { registeredModels } from "$lib/models";
import { bandColors } from "./bandPalette";
import { addEdge, bandListOf, moveEdge, removeEdge, setColor, setLabel, type BandList } from "./bands";

/** Every classifier a registered model's scan declares. */
const classifiers = registeredModels.flatMap((model) => (model.scan ? [model.scan.classifier] : []));

/** PMV's thermal sensation, the classifier the operations are shown on: seven bands, Cold … Hot. */
const sensation = PMV_THERMAL_SENSATION_VOTE_BINS_ISO;
const defaultList = bandListOf(sensation);

/**
 * `list` is well formed: three arrays of one length, Edges strictly rising,
 * and the library's classifier function, handed the list as it is, names the
 * band whose interval holds a value inside it, and on an Edge the band the
 * list's inclusivity puts it in.
 */
function expectWellFormed(list: BandList): void {
  const { edges, labels, colors, right } = list;
  expect(edges).toHaveLength(labels.length);
  expect(colors).toHaveLength(labels.length);
  edges.slice(1).forEach((edge, index) => expect(edge).toBeGreaterThan(edges[index]));
  labels.forEach((label, index) => {
    const inside = index === 0 ? edges[0] - 1 : (edges[index - 1] + edges[index]) / 2;
    expect(classifyFromBins(inside, list)).toBe(label);
    if (index < labels.length - 1) {
      expect(classifyFromBins(edges[index], list)).toBe(right ? label : labels[index + 1]);
    }
  });
}

describe("bandListOf", () => {
  it("copies each registered classifier's edges, labels and flag, with as many colours as labels", () => {
    expect(classifiers.length).toBeGreaterThan(0);
    for (const bins of classifiers) {
      const list = bandListOf(bins);
      expect(list.edges).toEqual(bins.edges);
      expect(list.labels).toEqual(bins.labels);
      expect(list.right).toBe(bins.right);
      expect(list.colors).toEqual(bandColors(bins));
      expectWellFormed(list);
    }
  });

  it("is a copy: the library's frozen arrays are not the list's", () => {
    expect(defaultList.edges).not.toBe(sensation.edges);
    expect(defaultList.labels).not.toBe(sensation.labels);
  });
});

describe("moveEdge", () => {
  // Thermal sensation's Edges: -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 10.
  it("refuses an Edge at or beyond either neighbour and returns the list unchanged", () => {
    for (const edge of [-1.5, -2, 0.5, 1, Number.NaN]) {
      expect(moveEdge(defaultList, 2, edge)).toBe(defaultList);
    }
  });

  it("moves only that Edge to a value strictly between its neighbours", () => {
    const moved = moveEdge(defaultList, 2, -0.7);
    expect(moved.edges).toEqual([-2.5, -1.5, -0.7, 0.5, 1.5, 2.5, 10]);
    expect(moved.labels).toEqual(defaultList.labels);
    expect(moved.colors).toEqual(defaultList.colors);
    expectWellFormed(moved);
  });

  it("bounds the first Edge by the one above alone and the last by the one below alone", () => {
    expect(moveEdge(defaultList, 0, -40).edges[0]).toBe(-40);
    expect(moveEdge(defaultList, 0, -1.5)).toBe(defaultList);
    expect(moveEdge(defaultList, 6, 3).edges[6]).toBe(3);
    expect(moveEdge(defaultList, 6, 2.5)).toBe(defaultList);
    expect(moveEdge(defaultList, 6, Number.POSITIVE_INFINITY)).toBe(defaultList);
  });
});

describe("addEdge", () => {
  it("inserts one Edge at a middle band's midpoint, the upper half keeping its label and colour, the lower half empty", () => {
    // "Neutral" is band 3, (-0.5, 0.5].
    const added = addEdge(defaultList, 3, sensation);
    expect(added.edges).toEqual([-2.5, -1.5, -0.5, 0, 0.5, 1.5, 2.5, 10]);
    expect(added.labels).toEqual(["Cold", "Cool", "Slightly Cool", "", "Neutral", "Slightly Warm", "Warm", "Hot"]);
    expect(added.colors).toEqual([...defaultList.colors.slice(0, 3), undefined, ...defaultList.colors.slice(3)]);
    expectWellFormed(added);
  });

  it("splits the first band at the midpoint down to the next Edge below in the classifier's own list", () => {
    // Cold merged into Cool: the first band is now (…, -1.5], and -2.5 is the classifier's Edge below it.
    const merged = removeEdge(defaultList, 0);
    const added = addEdge(merged, 0, sensation);
    expect(added.edges.slice(0, 2)).toEqual([-2, -1.5]);
    expect(added.labels.slice(0, 2)).toEqual(["", "Cool"]);
    expect(added.colors.slice(0, 2)).toEqual([undefined, defaultList.colors[1]]);
    expectWellFormed(added);
  });

  it("splits the first band one unit below its upper Edge when the classifier has no Edge below it", () => {
    const added = addEdge(defaultList, 0, sensation);
    expect(added.edges.slice(0, 2)).toEqual([-3.5, -2.5]);
    expect(added.labels.slice(0, 2)).toEqual(["", "Cold"]);
    expectWellFormed(added);
  });

  it("splits the last band too", () => {
    const added = addEdge(defaultList, 6, sensation);
    expect(added.edges.slice(-2)).toEqual([6.25, 10]);
    expect(added.labels.slice(-2)).toEqual(["", "Hot"]);
    expectWellFormed(added);
  });
});

describe("removeEdge", () => {
  it("merges a middle band into the band above, which keeps its label and colour", () => {
    const removed = removeEdge(defaultList, 2);
    expect(removed.edges).toEqual([-2.5, -1.5, 0.5, 1.5, 2.5, 10]);
    expect(removed.labels).toEqual(["Cold", "Cool", "Neutral", "Slightly Warm", "Warm", "Hot"]);
    expect(removed.colors).toEqual([...defaultList.colors.slice(0, 2), ...defaultList.colors.slice(3)]);
    expectWellFormed(removed);
  });

  it("merges the last band into the one below, which keeps its own and takes the last Edge", () => {
    const removed = removeEdge(defaultList, 6);
    expect(removed.edges).toEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 10]);
    expect(removed.labels).toEqual(["Cold", "Cool", "Slightly Cool", "Neutral", "Slightly Warm", "Warm"]);
    expect(removed.colors).toEqual(defaultList.colors.slice(0, 6));
    expectWellFormed(removed);
  });

  it("leaves the only band where it is", () => {
    let list = defaultList;
    while (list.labels.length > 1) {
      list = removeEdge(list, 0);
    }
    expect(list.labels).toEqual(["Hot"]);
    expect(list.edges).toEqual([10]);
    expect(removeEdge(list, 0)).toBe(list);
  });
});

describe("setLabel and setColor", () => {
  it("relabel one band", () => {
    const relabelled = setLabel(defaultList, 3, "Comfortable");
    expect(relabelled.labels).toEqual(defaultList.labels.map((label, index) => (index === 3 ? "Comfortable" : label)));
    expect(relabelled.edges).toEqual(defaultList.edges);
    expect(relabelled.colors).toEqual(defaultList.colors);
    expectWellFormed(relabelled);
  });

  it("recolour one band, and clear its colour", () => {
    const recoloured = setColor(defaultList, 3, "#00ff00");
    expect(recoloured.colors).toEqual(defaultList.colors.map((color, index) => (index === 3 ? "#00ff00" : color)));
    const cleared = setColor(recoloured, 3, undefined);
    expect(cleared.colors[3]).toBeUndefined();
    expect(cleared.labels).toEqual(defaultList.labels);
    expectWellFormed(cleared);
  });
});
