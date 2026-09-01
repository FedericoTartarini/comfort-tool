import { describe, expect, it } from "vitest";
import {
  bandsFromJsBins,
  displayClassifierLabel,
  thermalZonesFromBands,
} from "./classifierBins";
import { ZoneToken } from "./zoneTokens";

const HEAT_INDEX_TOKENS: Readonly<Record<string, ZoneToken>> = {
  "no risk": ZoneToken.Safe,
  caution: ZoneToken.Caution,
};

describe("displayClassifierLabel", () => {
  it("title-cases all-lowercase library labels and leaves mixed case unchanged", () => {
    expect(displayClassifierLabel("no risk")).toBe("No Risk");
    expect(displayClassifierLabel("extreme cold stress")).toBe("Extreme Cold Stress");
    expect(displayClassifierLabel("Little or no discomfort")).toBe(
      "Little or no discomfort",
    );
    expect(displayClassifierLabel("Slightly Cool")).toBe("Slightly Cool");
  });
});

describe("bandsFromJsBins display labels", () => {
  it("stores title-cased labels while resolving tokens from library strings", () => {
    const bands = bandsFromJsBins(
      {
        edges: [27, 32],
        labels: ["no risk", "caution"],
        right: true,
      },
      HEAT_INDEX_TOKENS,
    );

    expect(bands.map(({ label }) => label)).toEqual(["No Risk", "Caution"]);

    const extras = {
      "no risk": { category: "no risk", legendText: "Safe" },
    };
    const zones = thermalZonesFromBands(bands, HEAT_INDEX_TOKENS, extras);
    expect(zones[0]?.label).toBe("No Risk");
    expect(zones[0]?.category).toBe("no risk");
    expect(zones[0]?.legendText).toBe("Safe");
    expect(zones[0]?.token).toBe(ZoneToken.Safe);
  });
});
