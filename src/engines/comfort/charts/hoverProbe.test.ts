import { describe, expect, it } from "vitest";

import { createDisplayHoverProbe } from "./hoverProbe";
import type { ChartAxisScale } from "./types";
import { PhysicalQuantityId } from "../../../catalog/quantities";

function identityAxis(
  field: ChartAxisScale["field"],
  label: string,
): ChartAxisScale {
  return {
    field,
    label,
    units: "u",
    rangeSi: { min: 0, max: 10 },
    points: 2,
    toDisplay: (valueSi) => valueSi,
    toSi: (valueDisplay) => valueDisplay,
  };
}

describe("createDisplayHoverProbe", () => {
  it("converts display coordinates to SI before evaluating", () => {
    const probe = createDisplayHoverProbe(
      {
        ...identityAxis(PhysicalQuantityId.DryBulbTemperature, "X"),
        toDisplay: (valueSi) => valueSi * 2,
        toSi: (valueDisplay) => valueDisplay / 2,
      },
      identityAxis(PhysicalQuantityId.RelativeHumidity, "Y"),
      (xSi, ySi) => ({
        hovertemplate: `${xSi},${ySi}`,
      }),
    );

    expect(probe.probeDisplay(10, 4)).toEqual({ hovertemplate: "5,4" });
  });

  it("returns null for non-finite display coordinates", () => {
    const probe = createDisplayHoverProbe(
      identityAxis(PhysicalQuantityId.DryBulbTemperature, "X"),
      identityAxis(PhysicalQuantityId.RelativeHumidity, "Y"),
      () => ({ hovertemplate: "ok" }),
    );

    expect(probe.probeDisplay(Number.NaN, 1)).toBeNull();
    expect(probe.probeDisplay(1, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
