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

  it("fills zone `level` of `levels` in the hue, its opacity rising inwards to 0.4", () => {
    const fills = [0, 1, 2].map((level) => /^rgba\((\d+, \d+, \d+), ([\d.]+)\)$/.exec(chartInk.zoneFill(hue, level, 3)));
    // #0072b2 is 0, 114, 178.
    expect(fills.map((fill) => fill?.[1])).toEqual(["0, 114, 178", "0, 114, 178", "0, 114, 178"]);
    [0.4 / 3, 0.8 / 3, 0.4].forEach((alpha, level) => expect(Number(fills[level]?.[2])).toBeCloseTo(alpha, 12));
    expect(chartInk.zoneFill(hue, 0, 1)).toBe("rgba(0, 114, 178, 0.4)");
  });
});
