import { describe, expect, it } from "vitest";
import { chartInk } from "./bandPalette";
import { palette } from "./palette";
import { slotBadges } from "./slotBadge";

describe("a slot's badge", () => {
  it("names the three positions Input 1 to Input 3", () => {
    expect(slotBadges.map((badge) => badge.name)).toEqual(["Input 1", "Input 2", "Input 3"]);
  });

  it("gives the three positions the palette's three slot hues, one hex each", () => {
    expect(slotBadges.map((badge) => badge.hue)).toEqual(palette.slots);
  });
});

describe("a slot's inks", () => {
  const hue = palette.slots[0];

  it("draws the marker and a Comfort zone's outline in the hue itself", () => {
    expect(chartInk.marker(hue)).toBe(hue);
    expect(chartInk.zoneLine(hue)).toBe(hue);
  });

  it("fills zone `level` of `levels` in the hue, its opacity rising evenly from 0.2 outermost to 0.4 innermost", () => {
    const fillsOf = (levels: number) =>
      Array.from({ length: levels }, (_, level) => {
        const [, channels, alpha] = /^rgba\((\d+, \d+, \d+), ([\d.]+)\)$/.exec(chartInk.zoneFill(hue, level, levels)) ?? [];
        return { channels, alpha: Number(alpha) };
      });
    // #0072b2 is 0, 114, 178.
    for (const [levels, alphas] of [[1, [0.4]], [2, [0.2, 0.4]], [3, [0.2, 0.3, 0.4]]] as const) {
      const fills = fillsOf(levels);
      expect(fills.map((fill) => fill.channels)).toEqual(Array(levels).fill("0, 114, 178"));
      alphas.forEach((alpha, level) => expect(fills[level].alpha).toBeCloseTo(alpha, 2));
    }
  });
});
