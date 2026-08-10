import { describe, expect, expectTypeOf, it } from "vitest";

import {
  FieldKey,
  type CanonicalInputState,
} from "../../models/fieldKeys";
import { JsThermalComfortStandard } from "../../models/comfortModels";
import {
  ModifierFieldKey,
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

function createBaseInputs(): CanonicalInputState {
  return {
    [FieldKey.DryBulbTemperature]: 25,
    [FieldKey.MeanRadiantTemperature]: 25,
    [FieldKey.RelativeAirSpeed]: 0.1,
    [FieldKey.WindSpeed]: 1,
    [FieldKey.RelativeHumidity]: 50,
    [FieldKey.MetabolicRate]: 1.8,
    [FieldKey.ClothingInsulation]: 0.5,
    [FieldKey.ExternalWork]: 0,
    [FieldKey.PrevailingMeanOutdoorTemperature]: 20,
  };
}

describe("input modifiers", () => {
  it("preserves each declaration's exact input and affected-field types", () => {
    type MeasuredExtraInputs = Parameters<
      typeof measuredAirSpeedModifier.apply
    >[1];
    type MeasuredPatch = ReturnType<typeof measuredAirSpeedModifier.apply>;

    expectTypeOf<MeasuredExtraInputs>().toEqualTypeOf<Readonly<{
      [ModifierFieldKey.MeasuredAirSpeed]: number;
    }>>();
    expectTypeOf<MeasuredPatch>().toEqualTypeOf<Partial<Pick<
      CanonicalInputState,
      typeof FieldKey.RelativeAirSpeed
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
          [ModifierFieldKey.MeasuredAirSpeed]: 0.6,
        },
        [ModifierId.MorningClothingEstimate]: {},
        [ModifierId.DynamicClothing]: {},
        [ModifierId.SolarGain]: {},
      },
    );

    expect(effectiveInputs[FieldKey.RelativeAirSpeed]).toBe(0.84);
    expect(baseInputs[FieldKey.RelativeAirSpeed]).toBe(0.1);
  });

  it("applies the morning clothing estimate in canonical SI", () => {
    const effectiveInputs = morningClothingEstimateModifier.apply(
      createBaseInputs(),
      { [ModifierFieldKey.MorningOutdoorTemperature]: 10 },
    );

    expect(effectiveInputs[FieldKey.ClothingInsulation]).toBeCloseTo(0.59, 2);
  });

  it("applies solar gain to mean radiant temperature", () => {
    const baseInputs = createBaseInputs();
    const effectiveInputs = solarGainModifier.apply(
      baseInputs,
      {
        [ModifierFieldKey.SolarAltitude]: 45,
        [ModifierFieldKey.SolarHorizontalAngle]: 90,
        [ModifierFieldKey.DirectSolarRadiation]: 800,
        [ModifierFieldKey.SolarTransmittance]: 0.5,
        [ModifierFieldKey.SkyVaultViewFraction]: 0.5,
        [ModifierFieldKey.BodyExposureFraction]: 0.5,
      },
    );

    expect(effectiveInputs[FieldKey.MeanRadiantTemperature]).toBeCloseTo(40.1, 6);
    expect(
      effectiveInputs[FieldKey.MeanRadiantTemperature]!
      - baseInputs[FieldKey.MeanRadiantTemperature],
    ).toBeCloseTo(15.1, 6);
  });

  it("requires every declared input before activation", () => {
    expect(isModifierConfigurationComplete(solarGainModifier, {
      [ModifierFieldKey.SolarAltitude]: 45,
    })).toBe(false);
    expect(isModifierConfigurationComplete(solarGainModifier, {
      [ModifierFieldKey.SolarAltitude]: 45,
      [ModifierFieldKey.SolarHorizontalAngle]: 90,
      [ModifierFieldKey.DirectSolarRadiation]: 800,
      [ModifierFieldKey.SolarTransmittance]: 0.5,
      [ModifierFieldKey.SkyVaultViewFraction]: 0.5,
      [ModifierFieldKey.BodyExposureFraction]: 0.5,
    })).toBe(true);
  });

  it("composes modifier patches in declaration order", () => {
    const addTwo = defineInputModifier({
      id: ModifierId.MeasuredAirSpeed,
      label: "Add two",
      description: "",
      extraInputs: [],
      affectedFields: [FieldKey.MeanRadiantTemperature],
      apply: (inputs) => ({
        [FieldKey.MeanRadiantTemperature]: inputs[FieldKey.MeanRadiantTemperature] + 2,
      }),
    });
    const triple = defineInputModifier({
      id: ModifierId.SolarGain,
      label: "Triple",
      description: "",
      extraInputs: [],
      affectedFields: [FieldKey.MeanRadiantTemperature],
      apply: (inputs) => ({
        [FieldKey.MeanRadiantTemperature]: inputs[FieldKey.MeanRadiantTemperature] * 3,
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

    expect(forward[FieldKey.MeanRadiantTemperature]).toBe(81);
    expect(reverse[FieldKey.MeanRadiantTemperature]).toBe(77);
  });

  it("applies ASHRAE and ISO dynamic-clothing thresholds", () => {
    const ashrae = createDynamicClothingModifier(JsThermalComfortStandard.ASHRAE);
    const iso = createDynamicClothingModifier(JsThermalComfortStandard.ISO);
    const inputs = createBaseInputs();
    inputs[FieldKey.ClothingInsulation] = 1;

    inputs[FieldKey.MetabolicRate] = 1;
    expect(iso.apply(inputs, {})[FieldKey.ClothingInsulation]).toBe(1);

    inputs[FieldKey.MetabolicRate] = 1.1;
    expect(ashrae.apply(inputs, {})[FieldKey.ClothingInsulation]).toBe(1);
    expect(iso.apply(inputs, {})[FieldKey.ClothingInsulation]).toBeCloseTo(0.964, 3);

    inputs[FieldKey.MetabolicRate] = 1.2;
    expect(ashrae.apply(inputs, {})[FieldKey.ClothingInsulation]).toBe(1);
    inputs[FieldKey.MetabolicRate] = 1.21;
    expect(ashrae.apply(inputs, {})[FieldKey.ClothingInsulation]).toBeCloseTo(0.931, 3);
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
          [ModifierFieldKey.MorningOutdoorTemperature]: 10,
        },
        [ModifierId.DynamicClothing]: {},
      },
    );

    expect(effective[FieldKey.ClothingInsulation]).toBeCloseTo(0.485, 3);
  });

  it("rejects non-finite modifier output at the application boundary", () => {
    const invalid = defineInputModifier({
      id: ModifierId.DynamicClothing,
      label: "Invalid",
      description: "Returns an invalid value.",
      extraInputs: [],
      affectedFields: [FieldKey.ClothingInsulation],
      apply: () => ({ [FieldKey.ClothingInsulation]: Infinity }),
    });

    expect(() => applyInputModifierChain(
      createBaseInputs(),
      [invalid],
      { [ModifierId.DynamicClothing]: true },
      { [ModifierId.DynamicClothing]: {} },
    )).toThrow(/invalid input patch/i);
  });
});
