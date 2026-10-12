import { describe, expect, it } from "vitest";
import { chartInk } from "./bandPalette";
import { palette } from "./palette";
import { slotBadge, slotNames } from "./slotBadge";
import { slotPositions } from "./writtenSession";

describe("a slot's badge", () => {
  it("names position n Input n while the slots are named, in the position's hue", () => {
    expect(slotPositions.map((position) => slotBadge(position, true))).toEqual([
      { name: "Input 1", hue: palette.slots[0] },
      { name: "Input 2", hue: palette.slots[1] },
      { name: "Input 3", hue: palette.slots[2] },
    ]);
  });

  it("names no position while the slots are not named, and keeps the position's hue", () => {
    expect(slotPositions.map((position) => slotBadge(position, false))).toEqual(palette.slots.map((hue) => ({ hue })));
  });

  it("keeps the named texts by position, Input 1 to Input 3, for the slot buttons", () => {
    expect(slotNames).toEqual(["Input 1", "Input 2", "Input 3"]);
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
