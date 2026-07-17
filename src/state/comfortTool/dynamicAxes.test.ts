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

const adaptiveLikeConfig = {
  dynamicAxisFields: fields,
  dynamicAxisPairValidator: (xAxis: string, yAxis: string) => (
    !(
      (xAxis === FieldKey.OperativeTemperature && (
        yAxis === FieldKey.DryBulbTemperature ||
        yAxis === FieldKey.MeanRadiantTemperature
      )) ||
      (yAxis === FieldKey.OperativeTemperature && (
        xAxis === FieldKey.DryBulbTemperature ||
        xAxis === FieldKey.MeanRadiantTemperature
      ))
    )
  ),
};

describe("dynamicAxes", () => {
  it("validates supported, distinct, model-compatible pairs", () => {
    expect(isDynamicAxisPairValid(adaptiveLikeConfig, {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.MeanRadiantTemperature,
    })).toBe(true);
    expect(isDynamicAxisPairValid(adaptiveLikeConfig, {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.OperativeTemperature,
    })).toBe(false);
    expect(isDynamicAxisPairValid(adaptiveLikeConfig, {
      xAxis: FieldKey.RelativeHumidity,
      yAxis: FieldKey.MeanRadiantTemperature,
    })).toBe(false);
  });

  it("normalizes by preserving X, then Y, then declaration order", () => {
    expect(normalizeDynamicAxisPair(adaptiveLikeConfig, {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.OperativeTemperature,
    })).toEqual({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.MeanRadiantTemperature,
    });

    const preserveYConfig = {
      dynamicAxisFields: [
        FieldKey.DryBulbTemperature,
        FieldKey.MeanRadiantTemperature,
        FieldKey.RelativeAirSpeed,
      ],
      dynamicAxisPairValidator: (xAxis: string) => xAxis === FieldKey.RelativeAirSpeed,
    };
    expect(normalizeDynamicAxisPair(preserveYConfig, {
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.MeanRadiantTemperature,
    })).toEqual({
      xAxis: FieldKey.RelativeAirSpeed,
      yAxis: FieldKey.MeanRadiantTemperature,
    });

    expect(normalizeDynamicAxisPair(adaptiveLikeConfig, {
      xAxis: FieldKey.RelativeHumidity,
      yAxis: FieldKey.WindSpeed,
    })).toEqual({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.MeanRadiantTemperature,
    });
  });

  it("keeps same-field selection as a swap and rejects incompatible actions", () => {
    const pair = {
      xAxis: FieldKey.RelativeAirSpeed,
      yAxis: FieldKey.OperativeTemperature,
    };

    expect(resolveDynamicAxisSelection(
      adaptiveLikeConfig,
      pair,
      "x",
      FieldKey.OperativeTemperature,
    )).toEqual({
      xAxis: FieldKey.OperativeTemperature,
      yAxis: FieldKey.RelativeAirSpeed,
    });
    expect(resolveDynamicAxisSelection(
      adaptiveLikeConfig,
      pair,
      "x",
      FieldKey.DryBulbTemperature,
    )).toBeNull();
  });

  it("filters each axis menu through the pair validator", () => {
    const pair = {
      xAxis: FieldKey.RelativeAirSpeed,
      yAxis: FieldKey.OperativeTemperature,
    };

    expect(getDynamicAxisOptions(adaptiveLikeConfig, pair, "x")).toEqual([
      FieldKey.OperativeTemperature,
      FieldKey.RelativeAirSpeed,
    ]);
    expect(getDynamicAxisOptions(adaptiveLikeConfig, pair, "y")).toEqual([
      FieldKey.DryBulbTemperature,
      FieldKey.MeanRadiantTemperature,
      FieldKey.OperativeTemperature,
      FieldKey.RelativeAirSpeed,
    ]);
  });
});
