import { describe, expect, it } from "vitest";

import type { AdaptiveResponseDto } from "../comfortModels/adaptive/adaptiveShared";
import type { HumidexResponseDto } from "../comfortModels/humidex";
import type { HeatIndexResponseDto } from "../comfortModels/heatIndex";
import type { WindChillResponseDto } from "../comfortModels/windChill";
import type { UtciResponseDto } from "../comfortModels/utci/utci";
import type { PmvResponseDto } from "../comfortModels/pmv/pmvCalculation";
import type { PhsResponseDto } from "../models/phs";
import { calculateHeatIndex } from "../comfortModels/heatIndex";
import { calculateHumidex } from "../comfortModels/humidex";
import { calculateWindChill } from "../comfortModels/windChill";
import { calculateUtci } from "../comfortModels/utci/utciCalculation";
import { evaluatePmvCondition } from "../comfortModels/pmv/pmvCalculation";
import { pmvAshraeAdapter } from "../comfortModels/pmv/pmvAshrae";
import { calculatePhs } from "../comfortModels/phs/phsCalculation";
import { ModelId } from "../models/comfortModels";
import { PhysicalQuantityId } from "../models/physicalQuantities";
import { PhsPosture, PhsQuantityId } from "../models/phs";
import { InputId } from "../models/inputSlots";
import { comfortModelConfigs, comfortModelOrder } from "../state/comfortTool/modelConfigs";
import { createAnalysisState } from "../state/comfortTool/createComfortToolState.svelte";
import {
  createGoldenCalculationContext,
  getGoldenInputOverrides,
  phsBaselineInputOverrides,
  phsBaselineModelInputs,
  pickPmvRequest,
  pickUtciRequest,
} from "./goldenFixtures";
import { requiredControlIdsByModel } from "./requiredModelControls";

function calculatePrimaryResult<T>(
  modelId: ModelId,
  inputOverrides: Parameters<typeof createGoldenCalculationContext>[1] = {},
  modelInputOverrides: Parameters<typeof createGoldenCalculationContext>[2] = {},
): T {
  const context = createGoldenCalculationContext(
    modelId,
    inputOverrides,
    modelInputOverrides,
  );
  const { resultsByInput } = comfortModelConfigs[modelId].calculate(
    context,
    [InputId.Input1],
  );
  const result = resultsByInput[InputId.Input1];
  if (!result) {
    throw new Error(`Expected ${modelId} to return a primary result.`);
  }
  return result as T;
}

describe("golden regression — control counts", () => {
  for (const modelId of comfortModelOrder) {
    it(`${modelId} exposes the independently required Analysis controls`, () => {
      expect(comfortModelConfigs[modelId].controls.map(({ id }) => id)).toEqual([
        ...requiredControlIdsByModel[modelId],
      ]);
    });
  }
});

describe("golden regression — direct calculation snapshots", () => {
  it("Humidex baseline", () => {
    const result = calculateHumidex({ tdb: 30, rh: 70 });
    expect(result.humidex).toBeCloseTo(40.9, 1);
    expect(result.humidexDiscomfort).toBe("Intense");
  });

  it("Heat Index baseline", () => {
    const result = calculateHeatIndex({ tdb: 32, rh: 60 });
    expect(result.hi).toBeCloseTo(37.1, 1);
    expect(result.category).toBe("Extreme Caution");
  });

  it("Wind Chill baseline", () => {
    const result = calculateWindChill({ tdb: -10, v: 5 });
    expect(result.wciTemp).toBeCloseTo(-17.4, 1);
  });

  it("UTCI baseline", () => {
    const result = calculateUtci(pickUtciRequest());
    expect(result.utci).toBeCloseTo(25.5, 1);
    expect(result.stressCategory).toBe("no thermal stress");
  });

  it("PMV ASHRAE baseline", () => {
    const result = evaluatePmvCondition(pmvAshraeAdapter, pickPmvRequest());
    expect(result.pmv).toBeCloseTo(0.24, 2);
    expect(result.ppd).toBeCloseTo(6.2, 1);
  });

  it("PHS baseline with reference person", () => {
    const result = calculatePhs({
      durationMinutes: 60,
      person: {
        [PhsQuantityId.BodyWeight]: 75,
        [PhsQuantityId.Height]: 1.8,
        posture: PhsPosture.Standing,
        acclimatized: true,
        drinkingAllowed: true,
      },
      tdb: 35,
      tr: 35,
      v: 0.1,
      rh: 71,
      met: 2.6,
      clo: 0.5,
    });
    expect(result.valid).toBe(true);
    expect(result.dLimTreMinutes).toBeCloseTo(54, 0);
  });
});

describe("golden regression — calculate via model config", () => {
  it("Humidex matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<HumidexResponseDto>(ModelId.Humidex, {
      [PhysicalQuantityId.DryBulbTemperature]: 30,
      [PhysicalQuantityId.RelativeHumidity]: 70,
    });
    expect(result.humidex).toBeCloseTo(40.9, 1);
    expect(result.humidexDiscomfort).toBe("Intense");
  });

  it("Heat Index matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<HeatIndexResponseDto>(ModelId.HeatIndex, {
      [PhysicalQuantityId.DryBulbTemperature]: 32,
      [PhysicalQuantityId.RelativeHumidity]: 60,
    });
    expect(result.hi).toBeCloseTo(37.1, 1);
    expect(result.category).toBe("Extreme Caution");
  });

  it("Wind Chill matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<WindChillResponseDto>(ModelId.WindChill, {
      [PhysicalQuantityId.DryBulbTemperature]: -10,
      [PhysicalQuantityId.WindSpeed]: 5,
    });
    expect(result.wciTemp).toBeCloseTo(-17.4, 1);
  });

  it("UTCI matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<UtciResponseDto>(
      ModelId.Utci,
      getGoldenInputOverrides(ModelId.Utci),
    );
    expect(result.utci).toBeCloseTo(25.5, 1);
    expect(result.stressCategory).toBe("no thermal stress");
  });

  it("PMV ASHRAE matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<PmvResponseDto>(
      ModelId.PmvAshrae,
      getGoldenInputOverrides(ModelId.PmvAshrae),
    );
    expect(result.pmv).toBeCloseTo(0.24, 2);
    expect(result.ppd).toBeCloseTo(6.2, 1);
  });

  it("PMV ISO matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<PmvResponseDto>(
      ModelId.PmvIso,
      getGoldenInputOverrides(ModelId.PmvIso),
    );
    expect(result.pmv).toBeCloseTo(0.24, 2);
    expect(result.ppd).toBeCloseTo(6.2, 1);
  });

  it("Adaptive ASHRAE calculates from standard fixture inputs", () => {
    const result = calculatePrimaryResult<AdaptiveResponseDto>(
      ModelId.AdaptiveAshrae,
      getGoldenInputOverrides(ModelId.AdaptiveAshrae),
    );
    expect(result.tCmf).toBeCloseTo(24, 1);
    expect(result.isApplicable).toBe(true);
    expect(result.levels.length).toBeGreaterThan(0);
  });

  it("Adaptive EN calculates from standard fixture inputs", () => {
    const result = calculatePrimaryResult<AdaptiveResponseDto>(
      ModelId.AdaptiveEn,
      getGoldenInputOverrides(ModelId.AdaptiveEn),
    );
    expect(result.tCmf).toBeCloseTo(25.4, 1);
    expect(result.isApplicable).toBe(true);
    expect(result.levels.length).toBeGreaterThan(0);
  });

  it("PHS uses model inputs for person settings via model config", () => {
    const result = calculatePrimaryResult<PhsResponseDto>(
      ModelId.Phs2023,
      phsBaselineInputOverrides,
      phsBaselineModelInputs,
    );
    expect(result.valid).toBe(true);
    expect(result.dLimTreMinutes).toBeCloseTo(54, 0);
  });
});

describe("golden regression — controller default primary inputs", () => {
  it("input1 defaults match catalog primary defaults", () => {
    const toolState = createAnalysisState();
    const input1 = toolState.state.quantitiesByInput[InputId.Input1];
    expect(input1[PhysicalQuantityId.DryBulbTemperature]).toBe(26);
    expect(input1[PhysicalQuantityId.RelativeHumidity]).toBe(50);
    expect(input1[PhysicalQuantityId.MetabolicRate]).toBe(1.0);
  });
});
