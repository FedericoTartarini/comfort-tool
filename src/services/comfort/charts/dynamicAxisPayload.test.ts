import { describe, expect, it } from "vitest";

import {
  pmvAshraeAdapter,
} from "../../../comfortModels/pmvAshrae";
import { pmvIsoAdapter } from "../../../comfortModels/pmvIso";
import {
  createPmvRequestAxisAdapter,
  type PmvRequestDto,
} from "../../../comfortModels/pmvCalculation";
import {
  utciAxisAdapter,
  type UtciRequestDto,
} from "../../../comfortModels/utci";
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

    expect(solvedFieldWrites).toEqual([0, 50, 30, 25, 30]);
    expect(payload).toEqual({ tdb: 20, tr: 30, speed: 0.1 });
  });

  it("restores the solved field after a non-finite endpoint", () => {
    const payload = { tdb: 25, tr: 25, speed: 0.1 };
    const failingAdapter = {
      ...adapter,
      getOperativeTemperature: (currentPayload: TestPayload) => (
        currentPayload.tr === 0
          ? Number.NaN
          : (currentPayload.tdb + currentPayload.tr) / 2
      ),
    };

    expect(applyDynamicAxisCoordinates(
      payload,
      { field: FieldKey.DryBulbTemperature, valueSi: 20 },
      { field: FieldKey.OperativeTemperature, valueSi: 25 },
      failingAdapter,
    )).toBe(false);
    expect(payload).toEqual({ tdb: 20, tr: 25, speed: 0.1 });
  });

  it("rejects a zero-slope component and restores the probe", () => {
    const payload = { tdb: 25, tr: 25, speed: 0.1 };
    const flatAdapter = {
      ...adapter,
      getOperativeTemperature: () => 25,
    };

    expect(applyDynamicAxisCoordinates(
      payload,
      { field: FieldKey.DryBulbTemperature, valueSi: 20 },
      { field: FieldKey.OperativeTemperature, valueSi: 30 },
      flatAdapter,
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

describe("model request-axis adapters", () => {
  const pmvRequest: PmvRequestDto = {
    tdb: 24,
    tr: 26,
    vr: 0.3,
    rh: 50,
    met: 1.2,
    clo: 0.5,
    wme: 0,
    occupantHasAirSpeedControl: true,
  };

  it.each([
    [FieldKey.DryBulbTemperature, 21],
    [FieldKey.MeanRadiantTemperature, 22],
    [FieldKey.RelativeAirSpeed, 0.6],
    [FieldKey.WindSpeed, 0.7],
    [FieldKey.RelativeHumidity, 65],
    [FieldKey.MetabolicRate, 1.4],
    [FieldKey.ClothingInsulation, 0.8],
    [FieldKey.ExternalWork, 0.1],
  ] as const)("maps PMV field %s through the canonical request adapter", (field, value) => {
    const request = { ...pmvRequest };
    const pmvAxisAdapter = createPmvRequestAxisAdapter(pmvAshraeAdapter);

    pmvAxisAdapter.setAxisValue(request, field, value);

    expect(pmvAxisAdapter.getAxisValue(request, field)).toBe(value);
    if (field === FieldKey.WindSpeed) expect(request.vr).toBe(value);
  });

  it("applies standard-specific PMV operative temperature and clothing ranges", () => {
    const ashrae = createPmvRequestAxisAdapter(pmvAshraeAdapter);
    const iso = createPmvRequestAxisAdapter(pmvIsoAdapter);
    const request = { ...pmvRequest };

    expect(ashrae.getAxisValue(request, FieldKey.OperativeTemperature))
      .toBe(pmvAshraeAdapter.getOperativeTemperature(request));
    expect(iso.getAxisValue(request, FieldKey.OperativeTemperature))
      .toBe(pmvIsoAdapter.getOperativeTemperature(request));
    ashrae.setAxisValue(request, FieldKey.OperativeTemperature, 27);
    expect(request).toEqual(expect.objectContaining({ tdb: 27, tr: 27 }));
    expect(ashrae.getAxisRange(FieldKey.ClothingInsulation).max).toBe(1.5);
    expect(iso.getAxisRange(FieldKey.ClothingInsulation).max).toBe(2);
  });

  it.each([
    [FieldKey.DryBulbTemperature, 21],
    [FieldKey.MeanRadiantTemperature, 22],
    [FieldKey.WindSpeed, 1.5],
    [FieldKey.RelativeAirSpeed, 1.7],
    [FieldKey.RelativeHumidity, 65],
  ] as const)("maps UTCI field %s and its air-speed alias", (field, value) => {
    const request: UtciRequestDto = { tdb: 24, tr: 26, v: 1, rh: 50 };

    utciAxisAdapter.setAxisValue(request, field, value);

    expect(utciAxisAdapter.getAxisValue(request, field)).toBe(value);
    if (field === FieldKey.RelativeAirSpeed) expect(request.v).toBe(value);
  });

  it("sets UTCI operative temperature explicitly and retains solver component ranges", () => {
    const request: UtciRequestDto = { tdb: 24, tr: 26, v: 1, rh: 50 };

    utciAxisAdapter.setAxisValue(request, FieldKey.OperativeTemperature, 25);

    expect(request).toEqual({ tdb: 25, tr: 25, v: 1, rh: 50 });
    expect(utciAxisAdapter.getAxisValue(request, FieldKey.OperativeTemperature))
      .toBeCloseTo(25, 6);
    expect(utciAxisAdapter.getTemperatureComponentRange(FieldKey.DryBulbTemperature))
      .toEqual({ min: -50, max: 50 });
    expect(utciAxisAdapter.getTemperatureComponentRange(FieldKey.MeanRadiantTemperature))
      .toEqual({ min: -80, max: 120 });
  });

  it.each([
    [FieldKey.DryBulbTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.DryBulbTemperature],
    [FieldKey.MeanRadiantTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.MeanRadiantTemperature],
  ] as const)("solves the PMV coupled axis pair %s / %s", (xField, yField) => {
    const request = { ...pmvRequest };
    const pmvAxisAdapter = createPmvRequestAxisAdapter(pmvAshraeAdapter);
    const componentField = xField === FieldKey.OperativeTemperature ? yField : xField;

    expect(applyDynamicAxisCoordinates(
      request,
      { field: xField, valueSi: xField === FieldKey.OperativeTemperature ? 25 : 20 },
      { field: yField, valueSi: yField === FieldKey.OperativeTemperature ? 25 : 20 },
      pmvAxisAdapter,
    )).toBe(true);
    expect(pmvAxisAdapter.getAxisValue(request, componentField)).toBeCloseTo(20, 6);
    expect(pmvAxisAdapter.getOperativeTemperature(request)).toBeCloseTo(25, 6);
  });

  it.each([
    [FieldKey.DryBulbTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.DryBulbTemperature],
    [FieldKey.MeanRadiantTemperature, FieldKey.OperativeTemperature],
    [FieldKey.OperativeTemperature, FieldKey.MeanRadiantTemperature],
  ] as const)("solves the UTCI coupled axis pair %s / %s", (xField, yField) => {
    const request: UtciRequestDto = { tdb: 24, tr: 26, v: 1, rh: 50 };
    const componentField = xField === FieldKey.OperativeTemperature ? yField : xField;

    expect(applyDynamicAxisCoordinates(
      request,
      { field: xField, valueSi: xField === FieldKey.OperativeTemperature ? 25 : 20 },
      { field: yField, valueSi: yField === FieldKey.OperativeTemperature ? 25 : 20 },
      utciAxisAdapter,
    )).toBe(true);
    expect(utciAxisAdapter.getAxisValue(request, componentField)).toBeCloseTo(20, 6);
    expect(utciAxisAdapter.getOperativeTemperature(request)).toBeCloseTo(25, 6);
  });
});
