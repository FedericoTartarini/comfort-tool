import { describe, expect, it } from "vitest";

import {
  findProbeTraceIndex,
  nativeHoverSkipTraceIndices,
  plotDisplayCoordinates,
  probeRestyleAttributes,
  type PlotlyGraphDiv,
} from "./plotlyFieldHover";

function fakeGraph(overrides: Partial<PlotlyGraphDiv> = {}): PlotlyGraphDiv {
  const gd = document.createElement("div") as PlotlyGraphDiv;
  Object.assign(gd, overrides);
  gd.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    right: 210,
    bottom: 220,
    width: 200,
    height: 200,
    x: 10,
    y: 20,
    toJSON() {
      return {};
    },
  });
  return gd;
}

describe("plotlyFieldHover", () => {
  it("converts client pixels to axis display values inside the plot", () => {
    const gd = fakeGraph({
      _fullLayout: {
        xaxis: {
          _offset: 40,
          _length: 100,
          p2l: (px) => px,
        },
        yaxis: {
          _offset: 30,
          _length: 80,
          p2l: (px) => 80 - px,
        },
      },
    });

    expect(plotDisplayCoordinates(gd, 10 + 40 + 25, 20 + 30 + 10)).toEqual({
      xDisplay: 25,
      yDisplay: 70,
    });
    expect(plotDisplayCoordinates(gd, 10, 20)).toBeNull();
  });

  it("finds the probe trace by meta", () => {
    const gd = fakeGraph({
      data: [
        { meta: "field-hover-probe" },
        { meta: "other" },
      ],
    });

    expect(findProbeTraceIndex(gd)).toBe(0);
    expect(nativeHoverSkipTraceIndices(gd)).toEqual([1]);
  });

  it("wraps probe customdata as a per-point row for Plotly.restyle", () => {
    expect(probeRestyleAttributes(22, 50, {
      hovertemplate: "PMV: %{customdata[0]:.2~f}<extra></extra>",
      customdata: [-0.19, -0.19, 5.7],
    })).toEqual({
      x: [[22]],
      y: [[50]],
      hovertemplate: "PMV: %{customdata[0]:.2~f}<extra></extra>",
      customdata: [[[-0.19, -0.19, 5.7]]],
    });
  });
});
