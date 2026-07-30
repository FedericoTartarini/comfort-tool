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
  getAxisValue: (payload, field) => {
    if (field === FieldKey.DryBulbTemperature) return payload.tdb;
    if (field === FieldKey.MeanRadiantTemperature) return payload.tr;
    if (field === FieldKey.RelativeAirSpeed) return payload.speed;
    return (payload.tdb + payload.tr) / 2;
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
    const unreachable = resolve(
      FieldKey.DryBulbTemperature,
      50,
      FieldKey.OperativeTemperature,
      0,
    );
    expect(unreachable.valid).toBe(false);
    expect(unreachable.payload).toEqual({ tdb: 50, tr: 25, speed: 0.1 });
  });

  it("restores the probed component after a successful solve before committing it once", () => {
    const solvedFieldWrites: number[] = [];
    const trackingAdapter: DynamicAxisPayloadAdapter<TestPayload> = {
      ...adapter,
      setAxisValue: (payload, field, valueSi) => {
        adapter.setAxisValue(payload, field, valueSi);
        if (field === FieldKey.MeanRadiantTemperature) {
          solvedFieldWrites.push(valueSi);
        }
      },
    };
    const payload = { tdb: 25, tr: 25, speed: 0.1 };

    expect(applyDynamicAxisCoordinates(
      payload,
      { field: FieldKey.DryBulbTemperature, valueSi: 20 },
      { field: FieldKey.OperativeTemperature, valueSi: 25 },
      trackingAdapter,
    )).toBe(true);

    expect(solvedFieldWrites.slice(-2)).toEqual([25, 30]);
    expect(payload).toEqual({ tdb: 20, tr: 30, speed: 0.1 });
  });

  it.each([
    {
      name: "a non-finite endpoint",
      getOperativeTemperature: (payload: TestPayload) => (
        payload.tr === 0 ? Number.NaN : (payload.tdb + payload.tr) / 2
      ),
    },
    {
      name: "a non-finite interior probe",
      getOperativeTemperature: (payload: TestPayload) => (
        payload.tr === 25 ? Number.NaN : payload.tr
      ),
    },
  ])("restores the solved field after $name", ({ getOperativeTemperature }) => {
    const payload = { tdb: 25, tr: 25, speed: 0.1 };
    const failingAdapter = { ...adapter, getOperativeTemperature };

    expect(applyDynamicAxisCoordinates(
      payload,
      { field: FieldKey.DryBulbTemperature, valueSi: 20 },
      { field: FieldKey.OperativeTemperature, valueSi: 25 },
      failingAdapter,
    )).toBe(false);
    expect(payload).toEqual({ tdb: 20, tr: 25, speed: 0.1 });
  });

  it("restores the solved field when a probe throws", () => {
    const payload = { tdb: 25, tr: 25, speed: 0.1 };
    const throwingAdapter: DynamicAxisPayloadAdapter<TestPayload> = {
      ...adapter,
      getOperativeTemperature: () => {
        throw new Error("probe failed");
      },
    };

    expect(() => applyDynamicAxisCoordinates(
      payload,
      { field: FieldKey.DryBulbTemperature, valueSi: 20 },
      { field: FieldKey.OperativeTemperature, valueSi: 25 },
      throwingAdapter,
    )).toThrow("probe failed");
    expect(payload).toEqual({ tdb: 20, tr: 25, speed: 0.1 });
  });

  it("rolls back the solved field when the final post-condition fails", () => {
    const payload = { tdb: 25, tr: 25, speed: 0.1 };
    let evaluations = 0;
    const postConditionAdapter: DynamicAxisPayloadAdapter<TestPayload> = {
      ...adapter,
      getOperativeTemperature: (currentPayload) => {
        evaluations += 1;
        return evaluations >= 4
          ? 26
          : (currentPayload.tdb + currentPayload.tr) / 2;
      },
    };

    expect(applyDynamicAxisCoordinates(
      payload,
      { field: FieldKey.DryBulbTemperature, valueSi: 20 },
      { field: FieldKey.OperativeTemperature, valueSi: 25 },
      postConditionAdapter,
    )).toBe(false);
    expect(payload).toEqual({ tdb: 20, tr: 25, speed: 0.1 });
  });
});
