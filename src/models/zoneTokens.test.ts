import { describe, expect, it } from "vitest";

import { adaptiveAshraeZonesList } from "../comfortModels/adaptive/adaptiveAshrae";
import { adaptiveEnZonesList } from "../comfortModels/adaptive/adaptiveEn";
import { heatIndexZonesList } from "../comfortModels/heatIndex";
import { humidexZonesList } from "../comfortModels/humidex";
import { pmvZonesList } from "../comfortModels/pmv/calculation";
import { utciZonesList } from "../comfortModels/utci/utciCalculation";
import { windChillZonesList } from "../comfortModels/windChill";
import {
  remapZoneFill,
  resolveZoneAppearance,
  ZonePaletteKind,
  ZoneToken,
  ZONE_THEME,
  isZoneToken,
} from "./zoneTokens";

describe("zone tokens", () => {
  it("resolves every token on screen, publication, and colour-blind palettes", () => {
    for (const token of Object.values(ZoneToken)) {
      const screen = resolveZoneAppearance(token, ZonePaletteKind.Screen);
      const publication = resolveZoneAppearance(
        token,
        ZonePaletteKind.Publication,
      );
      const colourBlind = resolveZoneAppearance(
        token,
        ZonePaletteKind.ColourBlind,
      );

      expect(screen.fill).toMatch(/^#[0-9a-f]{6}$/);
      expect(screen.text).toMatch(/^#[0-9a-f]{6}$/);
      expect(publication.fill).toMatch(/^#[0-9a-f]{6}$/);
      expect(colourBlind.fill).toMatch(/^#[0-9a-f]{6}$/);
      expect(ZONE_THEME[token][ZonePaletteKind.Screen]).toEqual(screen);
    }
  });

  it("keeps shared screen fills on the same print and colour-blind fills", () => {
    const byScreenFill = new Map<string, ZoneToken>();
    for (const token of Object.values(ZoneToken)) {
      const screenFill = resolveZoneAppearance(token).fill;
      const existing = byScreenFill.get(screenFill);
      if (existing === undefined) {
        byScreenFill.set(screenFill, token);
        continue;
      }
      expect(remapZoneFill(screenFill, ZonePaletteKind.Publication)).toBe(
        resolveZoneAppearance(existing, ZonePaletteKind.Publication).fill,
      );
      expect(remapZoneFill(screenFill, ZonePaletteKind.ColourBlind)).toBe(
        resolveZoneAppearance(existing, ZonePaletteKind.ColourBlind).fill,
      );
    }
  });

  it("remaps known zone fills and passes unknown hex through", () => {
    const screenNeutral = resolveZoneAppearance(ZoneToken.Neutral).fill;
    expect(remapZoneFill(screenNeutral, ZonePaletteKind.Screen)).toBe(
      screenNeutral,
    );
    expect(remapZoneFill(screenNeutral, ZonePaletteKind.Publication)).toBe(
      resolveZoneAppearance(ZoneToken.Neutral, ZonePaletteKind.Publication).fill,
    );
    expect(remapZoneFill(screenNeutral, ZonePaletteKind.ColourBlind)).toBe(
      resolveZoneAppearance(ZoneToken.Neutral, ZonePaletteKind.ColourBlind).fill,
    );
    expect(remapZoneFill("#1e40af", ZonePaletteKind.Publication)).toBe("#1e40af");
    expect(remapZoneFill(" #F2F2F2 ", ZonePaletteKind.Publication)).toBe(
      resolveZoneAppearance(ZoneToken.Neutral, ZonePaletteKind.Publication).fill,
    );
  });

  it("changes print and colour-blind fills in this table, not per model", () => {
    const screen = resolveZoneAppearance(ZoneToken.FailFill).fill;
    const publication = remapZoneFill(screen, ZonePaletteKind.Publication);
    const colourBlind = remapZoneFill(screen, ZonePaletteKind.ColourBlind);

    expect(publication).not.toBe(screen);
    expect(colourBlind).not.toBe(screen);
    expect(colourBlind).not.toBe(publication);
  });

  it("lets registered models select tokens instead of hex", () => {
    const zones = [
      ...pmvZonesList,
      ...utciZonesList,
      ...adaptiveAshraeZonesList,
      ...adaptiveEnZonesList,
      ...heatIndexZonesList,
      ...humidexZonesList,
      ...windChillZonesList,
    ];

    expect(zones.length).toBeGreaterThan(0);
    for (const zone of zones) {
      expect(zone.token).toBeDefined();
      expect(isZoneToken(zone.token ?? "")).toBe(true);
      expect(zone.color).toBe(resolveZoneAppearance(zone.token!).fill);
    }
  });
});
