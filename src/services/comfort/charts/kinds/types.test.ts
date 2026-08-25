import { describe, expectTypeOf, it } from "vitest";

import { ChartKind, type ChartInstanceDeclaration } from "../../../../models/output/chartKinds";
import type { ModelDeclaration } from "../../../../state/comfortTool/modelConfigs/builder";
import type {
  DynamicFieldGridSpec,
  ModelChartDeclaration,
  ModelChartKindSpecMap,
  FrontendChartDeclaration,
  RegisteredChartKindSpec,
} from "./types";

describe("chart engine spec union", () => {
  it("keeps presentation instances free of engine spec", () => {
    expectTypeOf<ChartInstanceDeclaration>().not.toHaveProperty("spec");
    expectTypeOf<ChartInstanceDeclaration["type"]>().toEqualTypeOf<string | undefined>();
  });

  it("includes ParametricLine as an implemented engine", () => {
    expectTypeOf<typeof ChartKind>().toHaveProperty("ParametricLine");
    type EngineKind = RegisteredChartKindSpec<unknown, unknown>["kind"];
    expectTypeOf<EngineKind>().toEqualTypeOf<
      | typeof ChartKind.DynamicField
      | typeof ChartKind.BoundaryRegion
      | typeof ChartKind.ParametricLine
      | typeof ChartKind.BandScalar
      | typeof ChartKind.TimeSeriesLine
      | typeof ChartKind.Custom
    >();
  });

  it("keeps defineModel charts on the closed data-only engine/spec union", () => {
    type DeclaredKind = ModelChartDeclaration["kind"];
    type DeclaredCustom = Extract<ModelChartDeclaration, { kind: typeof ChartKind.Custom }>;
    type DeclaredMapKeys = keyof ModelChartKindSpecMap<unknown>;
    type UnknownEngineInKind = "invented-engine" extends ChartKind ? true : false;
    type DynamicSpec = Extract<
      ModelChartDeclaration,
      { kind: typeof ChartKind.DynamicField }
    >["spec"];
    type BandScalarSpec = Extract<
      ModelChartDeclaration,
      { kind: typeof ChartKind.BandScalar }
    >["spec"];
    type BoundarySpec = Extract<
      ModelChartDeclaration,
      { kind: typeof ChartKind.BoundaryRegion }
    >["spec"];
    type TimeSeriesSpec = Extract<
      ModelChartDeclaration,
      { kind: typeof ChartKind.TimeSeriesLine }
    >["spec"];
    type ParametricSpec = Extract<
      ModelChartDeclaration,
      { kind: typeof ChartKind.ParametricLine }
    >["spec"];

    expectTypeOf<DeclaredKind>().toEqualTypeOf<DeclaredMapKeys>();
    expectTypeOf<DeclaredKind>().toEqualTypeOf<
      | typeof ChartKind.DynamicField
      | typeof ChartKind.BoundaryRegion
      | typeof ChartKind.ParametricLine
      | typeof ChartKind.BandScalar
      | typeof ChartKind.TimeSeriesLine
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

    type AuthoringChart = ModelDeclaration<unknown, unknown>["outputCharts"][number];
    expectTypeOf<AuthoringChart>().toEqualTypeOf<ModelChartDeclaration>();
    expectTypeOf<Extract<AuthoringChart, { kind: typeof ChartKind.Custom }>>().toBeNever();
  });

  it("rejects mixed engine/spec pairing on model declarations", () => {
    type BandScalarWithGridSpec = {
      instanceId: string;
      name: string;
      emptyMessage: string;
      kind: typeof ChartKind.BandScalar;
      spec: DynamicFieldGridSpec<unknown>;
    };
    type DynamicWithBandSpec = {
      instanceId: string;
      name: string;
      emptyMessage: string;
      kind: typeof ChartKind.DynamicField;
      spec: { title: string; getOutputValue: (result: unknown) => number };
    };

    expectTypeOf<BandScalarWithGridSpec>().not.toMatchTypeOf<ModelChartDeclaration>();
    expectTypeOf<DynamicWithBandSpec>().not.toMatchTypeOf<ModelChartDeclaration>();
  });

  it("keeps named extended types inside the model-declaration engine/spec union", () => {
    type ExtendedModelChart = ModelChartDeclaration & { type: "audit.named-map" };
    type ExtendedKind = ExtendedModelChart["kind"];
    type EscapingExtended = {
      instanceId: string;
      name: string;
      emptyMessage: string;
      type: "audit.escape";
      kind: typeof ChartKind.Custom;
      spec: { build: () => null };
    };

    expectTypeOf<ExtendedKind>().toEqualTypeOf<keyof ModelChartKindSpecMap<unknown>>();
    expectTypeOf<Extract<ExtendedModelChart, { kind: typeof ChartKind.Custom }>>().toBeNever();
    expectTypeOf<EscapingExtended>().not.toMatchTypeOf<ModelChartDeclaration>();
  });

  it("keeps Custom Plotly builders on the frontend-internal union only", () => {
    type CustomChart = Extract<
      FrontendChartDeclaration,
      { kind: typeof ChartKind.Custom }
    >;
    expectTypeOf<CustomChart["spec"]>().toHaveProperty("build");
    expectTypeOf<CustomChart["spec"]>().not.toHaveProperty("resolveGridSpec");
  });
});
