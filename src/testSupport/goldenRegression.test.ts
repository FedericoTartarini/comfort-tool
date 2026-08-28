import { describe, expect, it } from "vitest";
import { PhysicalQuantityId } from "../catalog/quantities";

import type { AdaptiveResponse } from "../declarations/adaptive/shared";
import type { HumidexResponse } from "../declarations/humidex";
import type { HeatIndexResponse } from "../declarations/heatIndex";
import type { WindChillResponse } from "../declarations/windChill";
import type { UtciResponse } from "../declarations/utci/utci";
import type { PmvResponse } from "../declarations/pmv/calculation";
import type { PhsResponse } from "../catalog/phs";
import { calculateHeatIndex } from "../declarations/heatIndex";
import { calculateHumidex } from "../declarations/humidex";
import { calculateWindChill } from "../declarations/windChill";
import { calculateUtci } from "../declarations/utci/calculation";
import { evaluatePmvCondition } from "../declarations/pmv/calculation";
import { pmvAshraeAdapter } from "../declarations/pmv/ashrae";
import { calculatePhs } from "../declarations/phs/calculation";
import { ModelId } from "../catalog/modelIds";
import { PhsPosture } from "../catalog/phs";
import { InputId } from "../catalog/inputSlots";
import { comfortModelConfigs, comfortModelOrder } from "../state/modelRegistry";
import { createPointSession } from "../state/pointSession/createPointSession.svelte";
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
      person: { [PhysicalQuantityId.BodyWeight]: 75, [PhysicalQuantityId.Height]: 1.8, posture: PhsPosture.Standing, acclimatized: true, drinkingAllowed: true },
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
    const result = calculatePrimaryResult<HumidexResponse>(ModelId.Humidex, { [PhysicalQuantityId.DryBulbTemperature]: 30, [PhysicalQuantityId.RelativeHumidity]: 70 });
    expect(result.humidex).toBeCloseTo(40.9, 1);
    expect(result.humidexDiscomfort).toBe("Intense");
  });

  it("Heat Index matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<HeatIndexResponse>(ModelId.HeatIndex, { [PhysicalQuantityId.DryBulbTemperature]: 32, [PhysicalQuantityId.RelativeHumidity]: 60 });
    expect(result.hi).toBeCloseTo(37.1, 1);
    expect(result.category).toBe("Extreme Caution");
  });

  it("Wind Chill matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<WindChillResponse>(ModelId.WindChill, { [PhysicalQuantityId.DryBulbTemperature]: -10, [PhysicalQuantityId.WindSpeed]: 5 });
    expect(result.wciTemp).toBeCloseTo(-17.4, 1);
  });

  it("UTCI matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<UtciResponse>(
      ModelId.Utci,
      getGoldenInputOverrides(ModelId.Utci),
    );
    expect(result.utci).toBeCloseTo(25.5, 1);
    expect(result.stressCategory).toBe("no thermal stress");
  });

  it("PMV ASHRAE matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<PmvResponse>(
      ModelId.PmvAshrae,
      getGoldenInputOverrides(ModelId.PmvAshrae),
    );
    expect(result.pmv).toBeCloseTo(0.24, 2);
    expect(result.ppd).toBeCloseTo(6.2, 1);
  });

  it("PMV ISO matches golden baseline via model config", () => {
    const result = calculatePrimaryResult<PmvResponse>(
      ModelId.PmvIso,
      getGoldenInputOverrides(ModelId.PmvIso),
    );
    expect(result.pmv).toBeCloseTo(0.24, 2);
    expect(result.ppd).toBeCloseTo(6.2, 1);
  });

  it("Adaptive ASHRAE calculates from standard fixture inputs", () => {
    const result = calculatePrimaryResult<AdaptiveResponse>(
      ModelId.AdaptiveAshrae,
      getGoldenInputOverrides(ModelId.AdaptiveAshrae),
    );
    expect(result.tCmf).toBeCloseTo(24, 1);
    expect(result.isApplicable).toBe(true);
    expect(result.levels.length).toBeGreaterThan(0);
  });

  it("Adaptive EN calculates from standard fixture inputs", () => {
    const result = calculatePrimaryResult<AdaptiveResponse>(
      ModelId.AdaptiveEn,
      getGoldenInputOverrides(ModelId.AdaptiveEn),
    );
    expect(result.tCmf).toBeCloseTo(25.4, 1);
    expect(result.isApplicable).toBe(true);
    expect(result.levels.length).toBeGreaterThan(0);
  });

  it("PHS uses model inputs for person settings via model config", () => {
    const result = calculatePrimaryResult<PhsResponse>(
      ModelId.Phs2023,
      phsBaselineInputOverrides,
      phsBaselineModelInputs,
    );
    expect(result.valid).toBe(true);
    expect(result.dLimTreMinutes).toBeCloseTo(54, 0);
  });
});

describe("golden regression — controller default primary inputs", () => {
  it("input1 defaults match catalog primary defaults", () => { const session = createPointSession();
    const input1 = session.input.quantitiesByInput[InputId.Input1];
    expect(input1[PhysicalQuantityId.DryBulbTemperature]).toBe(26);
    expect(input1[PhysicalQuantityId.RelativeHumidity]).toBe(50);
    expect(input1[PhysicalQuantityId.MetabolicRate]).toBe(1.0); });
});
