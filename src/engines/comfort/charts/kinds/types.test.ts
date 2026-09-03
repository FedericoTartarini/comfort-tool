import { describe, expectTypeOf, it } from "vitest";

import { ChartType, type ChartInstanceDeclaration } from "../../../../catalog/chartTypes";
import type { ModelAuthoring } from "../../../../state/modelRegistry/builder";
import type {
  DynamicFieldGridSpec,
  FrontendChartDeclaration,
  RegisteredChartBindSpec,
} from "./types";

describe("chart type spec union", () => {
  it("keeps presentation instances free of bind spec", () => {
    expectTypeOf<ChartInstanceDeclaration>().not.toHaveProperty("spec");
    expectTypeOf<ChartInstanceDeclaration["type"]>().toEqualTypeOf<ChartType>();
  });

  it("lets defineModel select any closed ChartType", () => {
    type AuthoringChart = ModelAuthoring["charts"][number];
    type DeclaredKind = AuthoringChart["type"];
    type DeclaredPsychrometric = Extract<
      AuthoringChart,
      { type: typeof ChartType.Psychrometric }
    >;
    type UnknownTypeInKind = "invented-type" extends ChartType ? true : false;

    expectTypeOf<AuthoringChart>().toEqualTypeOf<FrontendChartDeclaration>();
    expectTypeOf<DeclaredKind>().toEqualTypeOf<ChartType>();
    expectTypeOf<DeclaredPsychrometric>().not.toBeNever();
    expectTypeOf<UnknownTypeInKind>().toEqualTypeOf<false>();
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

    expectTypeOf<UtciWithGridSpec>().not.toMatchTypeOf<FrontendChartDeclaration>();
    expectTypeOf<DynamicWithUtciSpec>().not.toMatchTypeOf<FrontendChartDeclaration>();
  });

  it("keeps Psychrometric data-only on the ChartType spec union", () => {
    type PsychrometricChart = Extract<
      FrontendChartDeclaration,
      { type: typeof ChartType.Psychrometric }
    >;
    type BindKind = RegisteredChartBindSpec<unknown, unknown>["type"];
    expectTypeOf<PsychrometricChart["spec"]>().toHaveProperty("evaluate");
    expectTypeOf<PsychrometricChart["spec"]>().not.toHaveProperty("build");
    expectTypeOf<PsychrometricChart["spec"]>().not.toHaveProperty("resolveGridSpec");
    expectTypeOf<BindKind>().toEqualTypeOf<ChartType>();
  });
});
