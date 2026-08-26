import { describe, expect, it } from "vitest";

import { PhysicalQuantityId } from "../../models/quantities";
import { InputId } from "../../models/inputSlots";
import { ModelOutputKey, type ChartBuildContext, type NumericBand } from "../../models/modelCapabilities";
import { FieldChartProfileKind } from "../../models/output/fieldChartProfile";
import { UnitSystem } from "../../models/units";
import { phsReferenceEnvironment, PhsQuantityId } from "../../models/phs";
import {
  phsExploreOutputs,
  phsModelConfig,
  phsRequestAdapter,
} from "./phs";
import { createPhsDynamicGridSpec } from "./charts";
import { getPhsWaterLossLimitG, personFromModelInputs } from "./calculation";
import "../../state/comfortTool/modelConfigs";

function createComplianceContext(
  modelInputs: ChartBuildContext<NumericBand>["modelInputs"] = {},
): ChartBuildContext<NumericBand> {
  return {
    unitSystem: UnitSystem.SI,
    baselineInputId: InputId.Input1,
    modelInputs,
    fieldChartConfig: {
      profileKind: FieldChartProfileKind.Compliance,
      xField: PhysicalQuantityId.DryBulbTemperature,
      yField: PhysicalQuantityId.RelativeHumidity,
      zOutput: ModelOutputKey.PhsLimitingExposureTime,
      bands: phsModelConfig.complianceProfile!.bands as readonly NumericBand[],
    },
  };
}

describe("createPhsDynamicGridSpec", () => {
  it("evaluates grid cells with person settings from chart modelInputs", () => {
    const defaultSpec = createPhsDynamicGridSpec(
      phsExploreOutputs,
      phsRequestAdapter,
      createComplianceContext(),
    );
    const heavySpec = createPhsDynamicGridSpec(
      phsExploreOutputs,
      phsRequestAdapter,
      createComplianceContext({
        [PhsQuantityId.BodyWeight]: 120,
      }),
    );

    const defaultResult = defaultSpec.evaluate(phsReferenceEnvironment);
    const heavyResult = heavySpec.evaluate(phsReferenceEnvironment);

    expect(defaultResult.valid).toBe(true);
    expect(heavyResult.valid).toBe(true);
    expect(heavyResult.waterLossLimitG).toBeGreaterThan(defaultResult.waterLossLimitG);
    expect(heavyResult.waterLossLimitG).toBe(
      getPhsWaterLossLimitG(personFromModelInputs({
        [PhsQuantityId.BodyWeight]: 120,
      })),
    );
  });
});
