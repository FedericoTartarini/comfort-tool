import { describe, expect, it } from "vitest";
import { slotBadges } from "./slotBadge";

describe("a slot's badge", () => {
  it("names the three positions Input 1 to Input 3", () => {
    expect(slotBadges.map((badge) => badge.name)).toEqual(["Input 1", "Input 2", "Input 3"]);
  });

  it("gives the three positions three hues, no ink of one equal to the same ink of another", () => {
    const hues = slotBadges.map((badge) => badge.hue);
    for (const ink of ["marker", "zoneLine", "zoneFillRgb"] as const) {
      expect(new Set(hues.map((hue) => hue[ink])).size, ink).toBe(hues.length);
    }
  });
});
