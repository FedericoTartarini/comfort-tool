import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import {
  getDynamicAxisOptions,
  isDynamicAxisPairValid,
  normalizeDynamicAxisPair,
  resolveDynamicAxisSelection,
} from "./dynamicAxes";

const fields = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.OperativeTemperature,
  PhysicalQuantityId.RelativeAirSpeed,
] as const;

const config = {
  dynamicAxisFields: fields,
  defaultDynamicAxes: { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.MeanRadiantTemperature },
};

describe("dynamicAxes", () => {
  it("validates supported, distinct pairs", () => {
    expect(isDynamicAxisPairValid(config, { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.MeanRadiantTemperature })).toBe(true);
    expect(isDynamicAxisPairValid(config, { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.OperativeTemperature })).toBe(true);
    expect(isDynamicAxisPairValid(config, { xAxis: PhysicalQuantityId.RelativeHumidity, yAxis: PhysicalQuantityId.MeanRadiantTemperature })).toBe(false);
  });

  it("normalizes every invalid pair to the declared default", () => {
    expect(normalizeDynamicAxisPair(config, { xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.DryBulbTemperature })).toEqual({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.MeanRadiantTemperature });

    expect(normalizeDynamicAxisPair(config, { xAxis: PhysicalQuantityId.RelativeHumidity, yAxis: PhysicalQuantityId.WindSpeed })).toEqual({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.MeanRadiantTemperature });
  });

  it("keeps same-field selection as a swap and rejects undeclared fields", () => {
    const pair = { xAxis: PhysicalQuantityId.RelativeAirSpeed, yAxis: PhysicalQuantityId.OperativeTemperature };

    expect(resolveDynamicAxisSelection(
      config,
      pair,
      "x",
      PhysicalQuantityId.OperativeTemperature,
    )).toEqual({ xAxis: PhysicalQuantityId.OperativeTemperature, yAxis: PhysicalQuantityId.RelativeAirSpeed });
    expect(resolveDynamicAxisSelection(
      config,
      pair,
      "x",
      PhysicalQuantityId.DryBulbTemperature,
    )).toEqual({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.OperativeTemperature });
    expect(resolveDynamicAxisSelection(
      config,
      pair,
      "x",
      PhysicalQuantityId.RelativeHumidity,
    )).toBeNull();
  });

  it("offers every declared field on each axis", () => {
    const pair = { xAxis: PhysicalQuantityId.RelativeAirSpeed, yAxis: PhysicalQuantityId.OperativeTemperature };

    expect(getDynamicAxisOptions(config, pair, "x")).toEqual([
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.MeanRadiantTemperature,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeAirSpeed,
    ]);
    expect(getDynamicAxisOptions(config, pair, "y")).toEqual([
      PhysicalQuantityId.DryBulbTemperature,
      PhysicalQuantityId.MeanRadiantTemperature,
      PhysicalQuantityId.OperativeTemperature,
      PhysicalQuantityId.RelativeAirSpeed,
    ]);
  });
});
