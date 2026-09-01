import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../../catalog/quantities";

import { InputId } from "../../catalog/inputSlots";
import { type ChartBuildContext, type NumericBand } from "../../catalog/modelCapabilities";
import { FieldChartProfileKind } from "../../catalog/fieldChartProfile";
import { UnitSystem } from "../../catalog/units";
import { phsReferenceEnvironment } from "../../catalog/phs";
import {
  phsExploreOutputs,
  phsModelConfig,
  phsQuantityMapping,
} from "./phs";
import { createPhsDynamicGridSpec } from "./charts";
import { getPhsWaterLossLimitG, personFromModelInputs } from "./calculation";
import "../../state/modelRegistry";

function createComplianceContext(
  modelInputs: ChartBuildContext<NumericBand>["modelInputs"] = {},
): ChartBuildContext<NumericBand> {
  return {
    unitSystem: UnitSystem.SI,
    baselineInputId: InputId.Input1,
    modelInputs,
    fieldChartConfig: { profileKind: FieldChartProfileKind.Compliance, xField: PhysicalQuantityId.DryBulbTemperature, yField: PhysicalQuantityId.RelativeHumidity, zOutput: PhysicalQuantityId.LimitingExposureTime, bands: phsModelConfig.complianceProfile!.bands as readonly NumericBand[] },
  };
}

describe("createPhsDynamicGridSpec", () => {
  it("evaluates grid cells with person settings from chart modelInputs", () => {
    const defaultSpec = createPhsDynamicGridSpec(
      phsExploreOutputs,
      phsQuantityMapping,
      createComplianceContext(),
    );
    const heavySpec = createPhsDynamicGridSpec(
      phsExploreOutputs,
      phsQuantityMapping,
      createComplianceContext({
        [PhysicalQuantityId.BodyWeight]: 120,
      }),
    );

    const defaultResult = defaultSpec.evaluate(phsReferenceEnvironment);
    const heavyResult = heavySpec.evaluate(phsReferenceEnvironment);

    expect(defaultResult.valid).toBe(true);
    expect(heavyResult.valid).toBe(true);
    expect(heavyResult.waterLossLimitG).toBeGreaterThan(defaultResult.waterLossLimitG);
    expect(heavyResult.waterLossLimitG).toBe(
      getPhsWaterLossLimitG(personFromModelInputs({
        [PhysicalQuantityId.BodyWeight]: 120,
      })),
    );
  });
});
