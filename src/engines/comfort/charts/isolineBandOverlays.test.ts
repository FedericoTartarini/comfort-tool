import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../../catalog/quantities";
import { maxRelativeAirSpeedWithoutOccupantControl } from "./ashraeAirSpeedLimits";
import {
  buildIsolineBandOverlayTraces,
  isOperativeAirSpeedPair,
  resolveIsolineIndependentAxis,
} from "./isolineBandOverlays";
import type { ChartAxisScale } from "./types";

const identityAxis = (
  field: ChartAxisScale["field"],
  rangeSi: { min: number; max: number },
): ChartAxisScale => ({
  field,
  label: String(field),
  units: "",
  decimals: 2,
  rangeSi,
  points: 2,
  toDisplay: (value) => value,
  toSi: (value) => value,
});

describe("isoline band overlays", () => {
  it("solves temperature when one axis is dry-bulb or operative", () => {
    expect(resolveIsolineIndependentAxis(
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeHumidity,
    )).toBe("x");
    expect(resolveIsolineIndependentAxis(
      PhysicalQuantityId.RelativeHumidity,
      PhysicalQuantityId.OperativeTemperature,
    )).toBe("y");
    expect(resolveIsolineIndependentAxis(
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.OperativeTemperature,
    )).toBe("y");
  });

  it("recognizes operative temperature paired with air speed", () => {
    expect(isOperativeAirSpeedPair(
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeAirSpeed,
    )).toBe(true);
    expect(isOperativeAirSpeedPair(
      PhysicalQuantityId.RelativeAirSpeed,
      PhysicalQuantityId.OperativeTemperature,
    )).toBe(true);
    expect(isOperativeAirSpeedPair(
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.RelativeAirSpeed,
    )).toBe(false);
  });

  it("clips To×vr vertices to the CBE vel-top envelope without occupant control", () => {
    const traces = buildIsolineBandOverlayTraces({
      bands: [{ min: -0.5, max: 0.5, label: "Neutral", color: "#22c55e" }],
      outputLabel: "PMV",
      evaluateField: (to, vr) => (to - 22) - 2 * vr,
      xAxis: identityAxis(PhysicalQuantityId.OperativeTemperature, { min: 10, max: 40 }),
      yAxis: identityAxis(PhysicalQuantityId.RelativeAirSpeed, { min: 0, max: 2 }),
      xField: PhysicalQuantityId.OperativeTemperature,
      yField: PhysicalQuantityId.RelativeAirSpeed,
      layout: "monotonic",
      clipAirSpeedWithoutOccupantControl: true,
    });
    const fill = traces.find(({ name }) => name?.includes("Neutral"));
    expect(fill?.type).toBe("scatter");
    expect(fill?.fill).toBe("toself");
    const xs = fill?.x ?? [];
    const ys = fill?.y ?? [];
    expect(xs.length).toBeGreaterThan(4);
    xs.forEach((to, index) => {
      expect(ys[index]).toBeLessThanOrEqual(
        maxRelativeAirSpeedWithoutOccupantControl(to) + 1e-9,
      );
    });
    const coolVertex = xs.findIndex((to) => to < 23);
    expect(coolVertex).toBeGreaterThanOrEqual(0);
    expect(ys[coolVertex]).toBeLessThanOrEqual(0.2 + 1e-9);
    const hotEnvelope = xs
      .map((to, index) => ({ to, vr: ys[index] ?? Number.NaN }))
      .filter(({ to }) => to > 25.5);
    expect(hotEnvelope.length).toBeGreaterThan(0);
    expect(Math.max(...hotEnvelope.map(({ vr }) => vr))).toBeCloseTo(0.8, 5);
  });
});
