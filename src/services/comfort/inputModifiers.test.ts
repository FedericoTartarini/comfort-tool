import { describe, expect, expectTypeOf, it } from "vitest";

import { PhysicalQuantityId, type PrimaryInputState } from "../../models/physicalQuantities";
import { JsThermalComfortStandard } from "../../models/comfortModels";
import {
  ModifierId,
  defineInputModifier,
} from "../../models/inputModifiers";
import {
  applyInputModifierChain,
  createDynamicClothingModifier,
  isModifierConfigurationComplete,
  measuredAirSpeedModifier,
  morningClothingEstimateModifier,
  solarGainModifier,
} from "./inputModifiers";

function createBaseInputs(): PrimaryInputState {
  return {
    [PhysicalQuantityId.DryBulbTemperature]: 25,
    [PhysicalQuantityId.MeanRadiantTemperature]: 25,
    [PhysicalQuantityId.RelativeAirSpeed]: 0.1,
    [PhysicalQuantityId.WindSpeed]: 1,
    [PhysicalQuantityId.RelativeHumidity]: 50,
    [PhysicalQuantityId.MetabolicRate]: 1.8,
    [PhysicalQuantityId.ClothingInsulation]: 0.5,
    [PhysicalQuantityId.ExternalWork]: 0,
    [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: 20,
  };
}

describe("input modifiers", () => {
  it("preserves each declaration's exact input and affected-field types", () => {
    type MeasuredExtraInputs = Parameters<
      typeof measuredAirSpeedModifier.apply
    >[1];
    type MeasuredPatch = ReturnType<typeof measuredAirSpeedModifier.apply>;

    expectTypeOf<MeasuredExtraInputs>().toEqualTypeOf<Readonly<{
      [PhysicalQuantityId.ModifierMeasuredAirSpeed]: number;
    }>>();
    expectTypeOf<MeasuredPatch>().toEqualTypeOf<Partial<Pick<
      PrimaryInputState,
      typeof PhysicalQuantityId.RelativeAirSpeed
    >>>();
  });

  it("applies measured air speed in SI without overwriting base inputs", () => {
    const baseInputs = Object.freeze(createBaseInputs());
    const effectiveInputs = applyInputModifierChain(
      baseInputs,
      [measuredAirSpeedModifier],
      {
        [ModifierId.MeasuredAirSpeed]: true,
        [ModifierId.MorningClothingEstimate]: false,
        [ModifierId.DynamicClothing]: false,
        [ModifierId.SolarGain]: false,
      },
      {
        [ModifierId.MeasuredAirSpeed]: {
          [PhysicalQuantityId.ModifierMeasuredAirSpeed]: 0.6,
        },
        [ModifierId.MorningClothingEstimate]: {},
        [ModifierId.DynamicClothing]: {},
        [ModifierId.SolarGain]: {},
      },
    );

    expect(effectiveInputs[PhysicalQuantityId.RelativeAirSpeed]).toBe(0.84);
    expect(baseInputs[PhysicalQuantityId.RelativeAirSpeed]).toBe(0.1);
  });

  it("applies the morning clothing estimate in canonical SI", () => {
    const effectiveInputs = morningClothingEstimateModifier.apply(
      createBaseInputs(),
      { [PhysicalQuantityId.ModifierMorningOutdoorTemperature]: 10 },
    );

    expect(effectiveInputs[PhysicalQuantityId.ClothingInsulation]).toBeCloseTo(0.59, 2);
  });

  it("applies solar gain to mean radiant temperature", () => {
    const baseInputs = createBaseInputs();
    const effectiveInputs = solarGainModifier.apply(
      baseInputs,
      {
        [PhysicalQuantityId.ModifierSolarAltitude]: 45,
        [PhysicalQuantityId.ModifierSolarHorizontalAngle]: 90,
        [PhysicalQuantityId.ModifierDirectSolarRadiation]: 800,
        [PhysicalQuantityId.ModifierSolarTransmittance]: 0.5,
        [PhysicalQuantityId.ModifierSkyVaultViewFraction]: 0.5,
        [PhysicalQuantityId.ModifierBodyExposureFraction]: 0.5,
      },
    );

    expect(effectiveInputs[PhysicalQuantityId.MeanRadiantTemperature]).toBeCloseTo(40.1, 6);
    expect(
      effectiveInputs[PhysicalQuantityId.MeanRadiantTemperature]!
      - baseInputs[PhysicalQuantityId.MeanRadiantTemperature],
    ).toBeCloseTo(15.1, 6);
  });

  it("requires every declared input before activation", () => {
    expect(isModifierConfigurationComplete(solarGainModifier, {
      [PhysicalQuantityId.ModifierSolarAltitude]: 45,
    })).toBe(false);
    expect(isModifierConfigurationComplete(solarGainModifier, {
      [PhysicalQuantityId.ModifierSolarAltitude]: 45,
      [PhysicalQuantityId.ModifierSolarHorizontalAngle]: 90,
      [PhysicalQuantityId.ModifierDirectSolarRadiation]: 800,
      [PhysicalQuantityId.ModifierSolarTransmittance]: 0.5,
      [PhysicalQuantityId.ModifierSkyVaultViewFraction]: 0.5,
      [PhysicalQuantityId.ModifierBodyExposureFraction]: 0.5,
    })).toBe(true);
  });

  it("composes modifier patches in declaration order", () => {
    const addTwo = defineInputModifier({
      id: ModifierId.MeasuredAirSpeed,
      label: "Add two",
      description: "",
      extraInputs: [],
      affectedFields: [PhysicalQuantityId.MeanRadiantTemperature],
      apply: (inputs) => ({
        [PhysicalQuantityId.MeanRadiantTemperature]: inputs[PhysicalQuantityId.MeanRadiantTemperature] + 2,
      }),
    });
    const triple = defineInputModifier({
      id: ModifierId.SolarGain,
      label: "Triple",
      description: "",
      extraInputs: [],
      affectedFields: [PhysicalQuantityId.MeanRadiantTemperature],
      apply: (inputs) => ({
        [PhysicalQuantityId.MeanRadiantTemperature]: inputs[PhysicalQuantityId.MeanRadiantTemperature] * 3,
      }),
    });
    const active = {
      [ModifierId.MeasuredAirSpeed]: true,
      [ModifierId.SolarGain]: true,
    };
    const inputs = {
      [ModifierId.MeasuredAirSpeed]: {},
      [ModifierId.SolarGain]: {},
    };

    const forward = applyInputModifierChain(
      createBaseInputs(),
      [addTwo, triple],
      active,
      inputs,
    );
    const reverse = applyInputModifierChain(
      createBaseInputs(),
      [triple, addTwo],
      active,
      inputs,
    );

    expect(forward[PhysicalQuantityId.MeanRadiantTemperature]).toBe(81);
    expect(reverse[PhysicalQuantityId.MeanRadiantTemperature]).toBe(77);
  });

  it("applies ASHRAE and ISO dynamic-clothing thresholds", () => {
    const ashrae = createDynamicClothingModifier(JsThermalComfortStandard.ASHRAE);
    const iso = createDynamicClothingModifier(JsThermalComfortStandard.ISO);
    const inputs = createBaseInputs();
    inputs[PhysicalQuantityId.ClothingInsulation] = 1;

    inputs[PhysicalQuantityId.MetabolicRate] = 1;
    expect(iso.apply(inputs, {})[PhysicalQuantityId.ClothingInsulation]).toBe(1);

    inputs[PhysicalQuantityId.MetabolicRate] = 1.1;
    expect(ashrae.apply(inputs, {})[PhysicalQuantityId.ClothingInsulation]).toBe(1);
    expect(iso.apply(inputs, {})[PhysicalQuantityId.ClothingInsulation]).toBeCloseTo(0.964, 3);

    inputs[PhysicalQuantityId.MetabolicRate] = 1.2;
    expect(ashrae.apply(inputs, {})[PhysicalQuantityId.ClothingInsulation]).toBe(1);
    inputs[PhysicalQuantityId.MetabolicRate] = 1.21;
    expect(ashrae.apply(inputs, {})[PhysicalQuantityId.ClothingInsulation]).toBeCloseTo(0.931, 3);
  });

  it("applies Morning Clothing before Dynamic Clothing", () => {
    const dynamic = createDynamicClothingModifier(JsThermalComfortStandard.ASHRAE);
    const effective = applyInputModifierChain(
      createBaseInputs(),
      [morningClothingEstimateModifier, dynamic],
      {
        [ModifierId.MorningClothingEstimate]: true,
        [ModifierId.DynamicClothing]: true,
      },
      {
        [ModifierId.MorningClothingEstimate]: {
          [PhysicalQuantityId.ModifierMorningOutdoorTemperature]: 10,
        },
        [ModifierId.DynamicClothing]: {},
      },
    );

    expect(effective[PhysicalQuantityId.ClothingInsulation]).toBeCloseTo(0.485, 3);
  });

  it("rejects non-finite modifier output at the application boundary", () => {
    const invalid = defineInputModifier({
      id: ModifierId.DynamicClothing,
      label: "Invalid",
      description: "Returns an invalid value.",
      extraInputs: [],
      affectedFields: [PhysicalQuantityId.ClothingInsulation],
      apply: () => ({ [PhysicalQuantityId.ClothingInsulation]: Infinity }),
    });

    expect(() => applyInputModifierChain(
      createBaseInputs(),
      [invalid],
      { [ModifierId.DynamicClothing]: true },
      { [ModifierId.DynamicClothing]: {} },
    )).toThrow(/invalid input patch/i);
  });
});
