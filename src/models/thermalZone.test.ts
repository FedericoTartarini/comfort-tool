import { describe, expect, it } from "vitest";

import { ThermalZone } from "./thermalZone";
import { resolveZoneAppearance, ZoneToken } from "./zoneTokens";

describe("ThermalZone", () => {
  it("resolves screen fill and text from a selected token", () => {
    const zone = new ThermalZone({
      label: "Neutral",
      min: -0.5,
      max: 0.5,
      token: ZoneToken.Neutral,
    });
    const appearance = resolveZoneAppearance(ZoneToken.Neutral);

    expect(zone.token).toBe(ZoneToken.Neutral);
    expect(zone.color).toBe(appearance.fill);
    expect(zone.textColor).toBe(appearance.text);
    expect(zone.cssClass).toBe(ZoneToken.Neutral);
  });

  it("allows hex-only zones for tests and leftover custom colours", () => {
    const zone = new ThermalZone({
      label: "Custom",
      color: "#0000ff",
    });

    expect(zone.token).toBeUndefined();
    expect(zone.color).toBe("#0000ff");
    expect(zone.textColor).toBe("#0000ff");
  });

  it("rejects a zone with neither token nor color", () => {
    expect(() => new ThermalZone({ label: "Empty" })).toThrow(
      /requires a zone token or a color/i,
    );
  });
});
