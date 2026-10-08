import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorFamilies } from "./bandPalette";
import { lettering, palette } from "./palette";

describe("the palette", () => {
  it("names every colour as a six-digit hex", () => {
    for (const [name, value] of Object.entries(palette)) {
      for (const color of [value].flat()) {
        expect(color, name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("gives the three slots three hues, none of them a colour of any band family", () => {
    expect(new Set(palette.slots).size).toBe(3);
    const bandColors = Object.values(colorFamilies).flatMap((family) => Object.values(family).flat());
    for (const hue of palette.slots) {
      expect(bandColors, hue).not.toContain(hue);
    }
  });
});

describe("the stylesheet", () => {
  const stylesheet = readFileSync(`${import.meta.dirname}/../app.css`, "utf8");
  /** The value `app.css` declares for `token`, as written. */
  const declared = (token: string) => new RegExp(`^\\s*${token}:\\s*([^;]+);`, "m").exec(stylesheet)?.[1];

  // The tokens the interface shares with the charts (ADR-0002 decision 66, rule 3).
  const shared = {
    "--brand": palette.brand,
    "--background": palette.paper,
    "--foreground": palette.ink,
    "--muted-foreground": palette.inkMuted,
    "--border": palette.line,
    "--input": palette.line,
    "--destructive": palette.alert,
  };

  for (const [token, color] of Object.entries(shared)) {
    it(`declares ${token} as the palette's ${color}`, () => {
      expect(declared(token)).toBe(color);
    });
  }

  it("draws the primary button and the focus ring in the brand colour", () => {
    expect(declared("--primary")).toBe("var(--brand)");
    expect(declared("--ring")).toBe("var(--brand)");
  });

  it("declares the family and the caption's size the charts letter in", () => {
    expect(declared("--font-sans")).toBe(lettering.family);
    expect(declared("--font-size-caption")).toBe(`${lettering.captionSize / 16}rem`);
  });

  it("declares no colour the palette does not name", () => {
    const named = Object.values<string | readonly string[]>(palette).flat();
    for (const color of stylesheet.match(/#[0-9a-f]{3,8}\b|oklch\(/gi) ?? []) {
      expect(named, color).toContain(color);
    }
  });
});
