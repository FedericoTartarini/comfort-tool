import { describe, expectTypeOf, it } from "vitest";

import { ChartType, type ChartInstanceDeclaration } from "../../../../catalog/chartTypes";
import type { ModelDeclaration } from "../../../../state/analysis/modelConfigs/builder";
import type {
  DynamicFieldGridSpec,
  ModelChartDeclaration,
  ModelChartTypeSpecMap,
  FrontendChartDeclaration,
  RegisteredChartBindSpec,
} from "./types";

describe("chart type spec union", () => {
  it("keeps presentation instances free of bind spec", () => {
    expectTypeOf<ChartInstanceDeclaration>().not.toHaveProperty("spec");
    expectTypeOf<ChartInstanceDeclaration["type"]>().toEqualTypeOf<ChartType>();
  });

  it("keeps defineModel charts on data-only Dynamic", () => {
    type DeclaredKind = ModelChartDeclaration["type"];
    type DeclaredPsychrometric = Extract<
      ModelChartDeclaration,
      { type: typeof ChartType.Psychrometric }
    >;
    type DeclaredMapKeys = keyof ModelChartTypeSpecMap<unknown>;
    type UnknownTypeInKind = "invented-type" extends ChartType ? true : false;
    type DynamicSpec = ModelChartDeclaration["spec"];

    expectTypeOf<DeclaredKind>().toEqualTypeOf<DeclaredMapKeys>();
    expectTypeOf<DeclaredKind>().toEqualTypeOf<typeof ChartType.Dynamic>();
    expectTypeOf<DeclaredPsychrometric>().toBeNever();
    expectTypeOf<UnknownTypeInKind>().toEqualTypeOf<false>();
    expectTypeOf<DynamicSpec>().toHaveProperty("resolveGridSpec");
    expectTypeOf<DynamicSpec>().not.toHaveProperty("build");

    type AuthoringChart = ModelDeclaration<unknown, unknown>["charts"][number];
    expectTypeOf<AuthoringChart>().toEqualTypeOf<ModelChartDeclaration>();
    expectTypeOf<
      Extract<AuthoringChart, { type: typeof ChartType.Psychrometric }>
    >().toBeNever();
  });

  it("rejects mixed type/spec pairing on model declarations", () => {
    type UtciWithGridSpec = {
      id: string;
      emptyMessage: string;
      type: typeof ChartType.Utci;
      spec: DynamicFieldGridSpec<unknown>;
    };
    type DynamicWithUtciSpec = {
      id: string;
      emptyMessage: string;
      type: typeof ChartType.Dynamic;
      spec: { title: string; getOutputValue: (result: unknown) => number };
    };

    expectTypeOf<UtciWithGridSpec>().not.toMatchTypeOf<ModelChartDeclaration>();
    expectTypeOf<DynamicWithUtciSpec>().not.toMatchTypeOf<ModelChartDeclaration>();
  });

  it("keeps Psychrometric Plotly builders on the frontend-internal union only", () => {
    type PsychrometricChart = Extract<
      FrontendChartDeclaration,
      { type: typeof ChartType.Psychrometric }
    >;
    type BindKind = RegisteredChartBindSpec<unknown, unknown>["type"];
    expectTypeOf<PsychrometricChart["spec"]>().toHaveProperty("build");
    expectTypeOf<PsychrometricChart["spec"]>().not.toHaveProperty("resolveGridSpec");
    expectTypeOf<BindKind>().toEqualTypeOf<ChartType>();
  });
});
