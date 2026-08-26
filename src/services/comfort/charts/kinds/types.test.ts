import { describe, expectTypeOf, it } from "vitest";

import { ChartEngine, type ChartInstanceDeclaration } from "../../../../models/chartEngines";
import type { ModelDeclaration } from "../../../../state/analysis/modelConfigs/builder";
import type {
  DynamicFieldGridSpec,
  ModelChartDeclaration,
  ModelChartEngineSpecMap,
  FrontendChartDeclaration,
  RegisteredChartEngineSpec,
} from "./types";

describe("chart engine spec union", () => {
  it("keeps presentation instances free of engine spec", () => {
    expectTypeOf<ChartInstanceDeclaration>().not.toHaveProperty("spec");
    expectTypeOf<ChartInstanceDeclaration["type"]>().toEqualTypeOf<string | undefined>();
  });

  it("includes ParametricLine as an implemented engine", () => {
    expectTypeOf<typeof ChartEngine>().toHaveProperty("ParametricLine");
    type EngineKind = RegisteredChartEngineSpec<unknown, unknown>["engine"];
    expectTypeOf<EngineKind>().toEqualTypeOf<
      | typeof ChartEngine.DynamicField
      | typeof ChartEngine.BoundaryRegion
      | typeof ChartEngine.ParametricLine
      | typeof ChartEngine.BandScalar
      | typeof ChartEngine.TimeSeriesLine
      | typeof ChartEngine.Custom
    >();
  });

  it("keeps defineModel charts on the closed data-only engine/spec union", () => {
    type DeclaredKind = ModelChartDeclaration["engine"];
    type DeclaredCustom = Extract<ModelChartDeclaration, { engine: typeof ChartEngine.Custom }>;
    type DeclaredMapKeys = keyof ModelChartEngineSpecMap<unknown>;
    type UnknownEngineInKind = "invented-engine" extends ChartEngine ? true : false;
    type DynamicSpec = Extract<
      ModelChartDeclaration,
      { engine: typeof ChartEngine.DynamicField }
    >["spec"];
    type BandScalarSpec = Extract<
      ModelChartDeclaration,
      { engine: typeof ChartEngine.BandScalar }
    >["spec"];
    type BoundarySpec = Extract<
      ModelChartDeclaration,
      { engine: typeof ChartEngine.BoundaryRegion }
    >["spec"];
    type TimeSeriesSpec = Extract<
      ModelChartDeclaration,
      { engine: typeof ChartEngine.TimeSeriesLine }
    >["spec"];
    type ParametricSpec = Extract<
      ModelChartDeclaration,
      { engine: typeof ChartEngine.ParametricLine }
    >["spec"];

    expectTypeOf<DeclaredKind>().toEqualTypeOf<DeclaredMapKeys>();
    expectTypeOf<DeclaredKind>().toEqualTypeOf<
      | typeof ChartEngine.DynamicField
      | typeof ChartEngine.BoundaryRegion
      | typeof ChartEngine.ParametricLine
      | typeof ChartEngine.BandScalar
      | typeof ChartEngine.TimeSeriesLine
    >();
    expectTypeOf<DeclaredCustom>().toBeNever();
    expectTypeOf<UnknownEngineInKind>().toEqualTypeOf<false>();

    expectTypeOf<DynamicSpec>().toHaveProperty("resolveGridSpec");
    expectTypeOf<DynamicSpec>().not.toHaveProperty("build");
    expectTypeOf<BandScalarSpec>().toHaveProperty("getOutputValue");
    expectTypeOf<BandScalarSpec>().not.toHaveProperty("build");
    expectTypeOf<BoundarySpec>().toHaveProperty("axisFields");
    expectTypeOf<BoundarySpec>().not.toHaveProperty("build");
    expectTypeOf<TimeSeriesSpec>().toHaveProperty("getSeries");
    expectTypeOf<TimeSeriesSpec>().not.toHaveProperty("build");
    expectTypeOf<ParametricSpec>().toHaveProperty("getGeometry");
    expectTypeOf<ParametricSpec>().not.toHaveProperty("build");

    type AuthoringChart = ModelDeclaration<unknown, unknown>["charts"][number];
    expectTypeOf<AuthoringChart>().toEqualTypeOf<ModelChartDeclaration>();
    expectTypeOf<Extract<AuthoringChart, { engine: typeof ChartEngine.Custom }>>().toBeNever();
  });

  it("rejects mixed engine/spec pairing on model declarations", () => {
    type BandScalarWithGridSpec = {
      id: string;
      name: string;
      emptyMessage: string;
      engine: typeof ChartEngine.BandScalar;
      spec: DynamicFieldGridSpec<unknown>;
    };
    type DynamicWithBandSpec = {
      id: string;
      name: string;
      emptyMessage: string;
      engine: typeof ChartEngine.DynamicField;
      spec: { title: string; getOutputValue: (result: unknown) => number };
    };

    expectTypeOf<BandScalarWithGridSpec>().not.toMatchTypeOf<ModelChartDeclaration>();
    expectTypeOf<DynamicWithBandSpec>().not.toMatchTypeOf<ModelChartDeclaration>();
  });

  it("keeps named extended types inside the model-declaration engine/spec union", () => {
    type ExtendedModelChart = ModelChartDeclaration & { type: "audit.named-map" };
    type ExtendedKind = ExtendedModelChart["engine"];
    type EscapingExtended = {
      id: string;
      name: string;
      emptyMessage: string;
      type: "audit.escape";
      engine: typeof ChartEngine.Custom;
      spec: { build: () => null };
    };

    expectTypeOf<ExtendedKind>().toEqualTypeOf<keyof ModelChartEngineSpecMap<unknown>>();
    expectTypeOf<Extract<ExtendedModelChart, { engine: typeof ChartEngine.Custom }>>().toBeNever();
    expectTypeOf<EscapingExtended>().not.toMatchTypeOf<ModelChartDeclaration>();
  });

  it("keeps Custom Plotly builders on the frontend-internal union only", () => {
    type CustomChart = Extract<
      FrontendChartDeclaration,
      { engine: typeof ChartEngine.Custom }
    >;
    expectTypeOf<CustomChart["spec"]>().toHaveProperty("build");
    expectTypeOf<CustomChart["spec"]>().not.toHaveProperty("resolveGridSpec");
  });
});
