import { describe, expect, it, beforeEach } from "vitest";

import { FieldChartProfileKind } from "../../../../catalog/fieldChartProfile";
import { InputId } from "../../../../catalog/inputSlots";
import { UnitSystem } from "../../../../catalog/units";
import { ChartLegendKind } from "../chartBuildResult";
import {
  buildChartMemoKey,
  clearChartMemo,
  hashBands,
  hashModelInputs,
  readChartMemo,
  writeChartMemo,
} from "./memo";

describe("chart build memo", () => {
  beforeEach(() => {
    clearChartMemo();
  });

  it("hashes bands in stable order", () => {
    const bands = [
      { min: 0, max: 1, label: "A" },
      { min: 1, max: 2, label: "B" },
    ];
    expect(hashBands(bands)).toBe("0:1:A|1:2:B");
  });

  it("hashes model inputs in stable key order", () => {
    expect(hashModelInputs({
      height: 1.8,
      bodyWeight: 80,
    })).toBe("bodyWeight:80|height:1.8");
    expect(hashModelInputs({})).toBe("");
  });

  it("uses distinct memo keys for different model inputs", () => {
    const shared = {
      modelId: "phs-2023",
      instanceId: "phs-dynamic-field",
      unitSystem: UnitSystem.SI,
      xAxis: "tdb",
      yAxis: "rh",
      zOutput: "phsLimitingExposureTime",
      bandsHash: hashBands([{ min: 0, max: 480, label: "Band" }]),
      baselineInputId: InputId.Input1,
      chartSourceVersion: 1,
      profileKind: FieldChartProfileKind.Compliance,
    };
    const defaultKey = buildChartMemoKey({
      ...shared,
      modelInputsHash: hashModelInputs({}),
    });
    const editedKey = buildChartMemoKey({
      ...shared,
      modelInputsHash: hashModelInputs({ bodyWeight: 90 }),
    });
    expect(defaultKey).not.toBe(editedKey);
  });

  it("uses distinct memo keys for Psychrometric Air vs Operative sources", () => {
    const shared = {
      modelId: "pmv-ashrae",
      instanceId: "pmv-psychrometric",
      unitSystem: UnitSystem.SI,
      xAxis: "tdb",
      yAxis: "hr",
      zOutput: "pmv",
      bandsHash: hashBands([{ min: -0.5, max: 0.5, label: "Neutral" }]),
      baselineInputId: InputId.Input1,
      chartSourceVersion: 1,
      profileKind: FieldChartProfileKind.Explore,
      modelInputsHash: hashModelInputs({}),
    };
    expect(buildChartMemoKey({ ...shared, sourceHash: "" }))
      .not.toBe(buildChartMemoKey({ ...shared, sourceHash: "psychtop" }));
  });

  it("stores and reads memoized chart build results", () => {
    const key = buildChartMemoKey({
      modelId: "pmv-ashrae",
      instanceId: "pmv-psychrometric",
      unitSystem: UnitSystem.SI,
      xAxis: "tdb",
      yAxis: "rh",
      zOutput: "pmv",
      bandsHash: hashBands([{ min: -0.5, max: 0.5, label: "Neutral" }]),
      baselineInputId: InputId.Input1,
      chartSourceVersion: 1,
      profileKind: FieldChartProfileKind.Compliance,
      modelInputsHash: hashModelInputs({}),
    });
    expect(readChartMemo(key)).toBeUndefined();

    const cached = {
      payload: null,
      legend: {
        kind: ChartLegendKind.Bands,
        title: "PMV Zones",
        items: [{ label: "Neutral", color: "#f2f2f2" }],
      },
      readiness: "ready" as const,
      emptyMessage: "",
    };
    writeChartMemo(key, cached);
    expect(readChartMemo(key)).toEqual(cached);
  });
});
