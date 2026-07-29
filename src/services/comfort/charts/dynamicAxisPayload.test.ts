import { describe, expect, it } from "vitest";

import { FieldKey } from "../../../models/fieldKeys";
import {
  applyDynamicAxisCoordinates,
  type DynamicAxisPayloadAdapter,
} from "./dynamicAxisPayload";

interface TestPayload {
  tdb: number;
  tr: number;
  speed: number;
}

const adapter: DynamicAxisPayloadAdapter<TestPayload> = {
  setAxisValue: (payload, field, valueSi) => {
    if (field === FieldKey.DryBulbTemperature) payload.tdb = valueSi;
    else if (field === FieldKey.MeanRadiantTemperature) payload.tr = valueSi;
    else if (field === FieldKey.RelativeAirSpeed) payload.speed = valueSi;
    else if (field === FieldKey.OperativeTemperature) {
      payload.tdb = valueSi;
      payload.tr = valueSi;
    }
  },
  getOperativeTemperature: (payload) => (
    payload.speed >= 1
      ? payload.tdb * 0.4 + payload.tr * 0.6
      : payload.tdb * 0.5 + payload.tr * 0.5
  ),
  getTemperatureComponentRange: () => ({ min: 0, max: 50 }),
};

function resolve(
  xField: Parameters<typeof applyDynamicAxisCoordinates<TestPayload>>[1]["field"],
  xValueSi: number,
  yField: Parameters<typeof applyDynamicAxisCoordinates<TestPayload>>[1]["field"],
  yValueSi: number,
) {
  const payload = { tdb: 25, tr: 25, speed: 0.1 };
  const valid = applyDynamicAxisCoordinates(
    payload,
    { field: xField, valueSi: xValueSi },
    { field: yField, valueSi: yValueSi },
    adapter,
  );
  return { payload, valid };
}

describe("applyDynamicAxisCoordinates", () => {
  it.each([
    [FieldKey.DryBulbTemperature, 20, FieldKey.OperativeTemperature, 25],
    [FieldKey.OperativeTemperature, 25, FieldKey.DryBulbTemperature, 20],
    [FieldKey.MeanRadiantTemperature, 30, FieldKey.OperativeTemperature, 25],
    [FieldKey.OperativeTemperature, 25, FieldKey.MeanRadiantTemperature, 30],
  ] as const)("preserves both coupled coordinates for %s / %s", (
    xField,
    xValueSi,
    yField,
    yValueSi,
  ) => {
    const { payload, valid } = resolve(xField, xValueSi, yField, yValueSi);

    expect(valid).toBe(true);
    const expectedAir = xField === FieldKey.DryBulbTemperature
      ? xValueSi
      : yField === FieldKey.DryBulbTemperature
        ? yValueSi
        : 20;
    const expectedRadiant = xField === FieldKey.MeanRadiantTemperature
      ? xValueSi
      : yField === FieldKey.MeanRadiantTemperature
        ? yValueSi
        : 30;
    expect(payload.tdb).toBeCloseTo(expectedAir, 6);
    expect(payload.tr).toBeCloseTo(expectedRadiant, 6);
    expect(adapter.getOperativeTemperature(payload)).toBeCloseTo(25, 6);
  });

  it("applies speed before resolving operative temperature", () => {
    const { payload, valid } = resolve(
      FieldKey.OperativeTemperature,
      27,
      FieldKey.RelativeAirSpeed,
      1,
    );

    expect(valid).toBe(true);
    expect(payload.speed).toBe(1);
    expect(adapter.getOperativeTemperature(payload)).toBeCloseTo(27, 6);
  });

  it("rejects duplicate axes and physically unreachable constraints", () => {
    expect(resolve(
      FieldKey.DryBulbTemperature,
      20,
      FieldKey.DryBulbTemperature,
      30,
    ).valid).toBe(false);
    expect(resolve(
      FieldKey.DryBulbTemperature,
      50,
      FieldKey.OperativeTemperature,
      0,
    ).valid).toBe(false);
  });
});
