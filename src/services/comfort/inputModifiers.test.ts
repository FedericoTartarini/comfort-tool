import { describe, expect, it } from "vitest";

import {
  FieldKey,
  type CanonicalInputState,
} from "../../models/fieldKeys";
import {
  ModifierFieldKey,
  ModifierId,
  type InputModifier,
} from "../../models/inputModifiers";
import {
  applyInputModifierChain,
  applyModifierDefinitions,
  inputModifierById,
  isModifierConfigurationComplete,
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
  it("applies measured air speed in SI without overwriting base inputs", () => {
    const baseInputs = Object.freeze(createBaseInputs());
    const effectiveInputs = applyInputModifierChain(
      baseInputs,
      [ModifierId.MeasuredAirSpeed],
      {
        [ModifierId.MeasuredAirSpeed]: true,
        [ModifierId.MorningClothingEstimate]: false,
        [ModifierId.SolarGain]: false,
      },
      {
        [ModifierId.MeasuredAirSpeed]: {
          [ModifierFieldKey.MeasuredAirSpeed]: 0.6,
        },
        [ModifierId.MorningClothingEstimate]: {},
        [ModifierId.SolarGain]: {},
      },
    );

    expect(effectiveInputs[FieldKey.RelativeAirSpeed]).toBe(0.84);
    expect(baseInputs[FieldKey.RelativeAirSpeed]).toBe(0.1);
  });

  it("applies the morning clothing estimate in canonical SI", () => {
    const effectiveInputs = inputModifierById[ModifierId.MorningClothingEstimate].apply(
      createBaseInputs(),
      { [ModifierFieldKey.MorningOutdoorTemperature]: 10 },
    );

    expect(effectiveInputs[FieldKey.ClothingInsulation]).toBeCloseTo(0.59, 2);
  });

  it("applies solar gain to mean radiant temperature", () => {
    const baseInputs = createBaseInputs();
    const effectiveInputs = inputModifierById[ModifierId.SolarGain].apply(
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
    expect(isModifierConfigurationComplete(ModifierId.SolarGain, {
      [ModifierFieldKey.SolarAltitude]: 45,
    })).toBe(false);
    expect(isModifierConfigurationComplete(ModifierId.SolarGain, {
      [ModifierFieldKey.SolarAltitude]: 45,
      [ModifierFieldKey.SolarHorizontalAngle]: 90,
      [ModifierFieldKey.DirectSolarRadiation]: 800,
      [ModifierFieldKey.SolarTransmittance]: 0.5,
      [ModifierFieldKey.SkyVaultViewFraction]: 0.5,
      [ModifierFieldKey.BodyExposureFraction]: 0.5,
    })).toBe(true);
  });

  it("composes modifier patches in declaration order", () => {
    const addTwo: InputModifier = {
      id: ModifierId.MeasuredAirSpeed,
      label: "Add two",
      description: "",
      extraInputs: [],
      affectedFields: [FieldKey.MeanRadiantTemperature],
      apply: (inputs) => ({
        [FieldKey.MeanRadiantTemperature]: inputs[FieldKey.MeanRadiantTemperature] + 2,
      }),
    };
    const triple: InputModifier = {
      id: ModifierId.SolarGain,
      label: "Triple",
      description: "",
      extraInputs: [],
      affectedFields: [FieldKey.MeanRadiantTemperature],
      apply: (inputs) => ({
        [FieldKey.MeanRadiantTemperature]: inputs[FieldKey.MeanRadiantTemperature] * 3,
      }),
    };
    const active = {
      [ModifierId.MeasuredAirSpeed]: true,
      [ModifierId.SolarGain]: true,
    };
    const inputs = {
      [ModifierId.MeasuredAirSpeed]: {},
      [ModifierId.SolarGain]: {},
    };

    const forward = applyModifierDefinitions(
      createBaseInputs(),
      [addTwo, triple],
      active,
      inputs,
    );
    const reverse = applyModifierDefinitions(
      createBaseInputs(),
      [triple, addTwo],
      active,
      inputs,
    );

    expect(forward[FieldKey.MeanRadiantTemperature]).toBe(81);
    expect(reverse[FieldKey.MeanRadiantTemperature]).toBe(77);
  });
});
