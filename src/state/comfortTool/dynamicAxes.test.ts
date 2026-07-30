import { describe, expect, it } from "vitest";

import { FieldKey } from "../../models/fieldKeys";
import {
  getDynamicAxisOptions,
  isDynamicAxisPairValid,
  normalizeDynamicAxisPair,
  resolveDynamicAxisSelection,
} from "./dynamicAxes";

const fields = [
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.OperativeTemperature,
  FieldKey.RelativeAirSpeed,
] as const;

const config = {
  dynamicAxisFields: fields,
  defaultDynamicAxes: {
    xAxis: FieldKey.DryBulbTemperature,
    yAxis: FieldKey.MeanRadiantTemperature,
  },
};

describe("dynamicAxes", () => {
  it("validates supported, distinct pairs", () => {
    expect(isDynamicAxisPairValid(config, {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.MeanRadiantTemperature,
    })).toBe(true);
    expect(isDynamicAxisPairValid(config, {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.OperativeTemperature,
    })).toBe(true);
    expect(isDynamicAxisPairValid(config, {
      xAxis: FieldKey.RelativeHumidity,
      yAxis: FieldKey.MeanRadiantTemperature,
    })).toBe(false);
  });

  it("normalizes every invalid pair to the declared default", () => {
    expect(normalizeDynamicAxisPair(config, {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.DryBulbTemperature,
    })).toEqual({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.MeanRadiantTemperature,
    });

    expect(normalizeDynamicAxisPair(config, {
      xAxis: FieldKey.RelativeHumidity,
      yAxis: FieldKey.WindSpeed,
    })).toEqual({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.MeanRadiantTemperature,
    });
  });

  it("keeps same-field selection as a swap and rejects undeclared fields", () => {
    const pair = {
      xAxis: FieldKey.RelativeAirSpeed,
      yAxis: FieldKey.OperativeTemperature,
    };

    expect(resolveDynamicAxisSelection(
      config,
      pair,
      "x",
      FieldKey.OperativeTemperature,
    )).toEqual({
      xAxis: FieldKey.OperativeTemperature,
      yAxis: FieldKey.RelativeAirSpeed,
    });
    expect(resolveDynamicAxisSelection(
      config,
      pair,
      "x",
      FieldKey.DryBulbTemperature,
    )).toEqual({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.OperativeTemperature,
    });
    expect(resolveDynamicAxisSelection(
      config,
      pair,
      "x",
      FieldKey.RelativeHumidity,
    )).toBeNull();
  });

  it("offers every declared field on each axis", () => {
    const pair = {
      xAxis: FieldKey.RelativeAirSpeed,
      yAxis: FieldKey.OperativeTemperature,
    };

    expect(getDynamicAxisOptions(config, pair, "x")).toEqual([
      FieldKey.DryBulbTemperature,
      FieldKey.MeanRadiantTemperature,
      FieldKey.OperativeTemperature,
      FieldKey.RelativeAirSpeed,
    ]);
    expect(getDynamicAxisOptions(config, pair, "y")).toEqual([
      FieldKey.DryBulbTemperature,
      FieldKey.MeanRadiantTemperature,
      FieldKey.OperativeTemperature,
      FieldKey.RelativeAirSpeed,
    ]);
  });
});
