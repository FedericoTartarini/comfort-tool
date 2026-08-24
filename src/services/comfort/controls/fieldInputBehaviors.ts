import { InputControlId } from "../../../models/inputControls";
import { TemperatureMode, type ModelOptionsRecord } from "../../../models/inputModes";
import {
  UnitSystem as UnitSystemType,
  UnitSystem,
} from "../../../models/units";
import { formatDisplayValue } from "../../units";
import { createHumidityControlBehavior } from "./humidityControl";
import {
  buildDefaultPresentation,
  createAirSpeedControlBehavior,
  createControlBehavior,
  type NumericControlBehaviorConfig,
} from "./numericControl";
import {
  getInputPresetOptions,
  type InputPresetKey,
} from "./inputControlPresets";
import {
  createOperativeTemperatureControlBehavior,
  requireTemperatureMode,
} from "./temperatureControl";
import type { BehaviorPatch, InputControlBehavior, InputControlDefinition } from "./types";
import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  getQuantityDisplayMeta,
  type DerivedSlotQuantityState,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
  type PrimaryQuantityId,
} from "../../../models/physicalQuantities";
import {
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
} from "../../units/physicalQuantities";
type PostTemperatureSynchronizer = (
  inputState: PrimaryInputState,
  derivedState: DerivedSlotQuantityState,
  options: ModelOptionsRecord,
) => PrimaryInputState;

export type NumericInputFieldSpec = {
  kind: "numeric";
  controlId: (typeof InputControlId)[keyof typeof InputControlId];
  fieldKey: PrimaryQuantityId;
  minValue?: number;
  maxValue?: number;
  label?: string;
};

export type OperativeTemperatureInputFieldSpec = {
  kind: "operativeTemperature";
  minValue?: number;
  maxValue?: number;
  postSynchronize?: PostTemperatureSynchronizer;
};

export type RadiantTemperatureInputFieldSpec = {
  kind: "radiantTemperature";
  minValue?: number;
  maxValue?: number;
  hideWhen: "operative" | "air";
  label?: string;
};

export type SimpleHumidityInputFieldSpec = {
  kind: "simpleHumidity";
};

export type AdvancedHumidityInputFieldSpec = {
  kind: "advancedHumidity";
};

export type OccupantAirSpeedInputFieldSpec = {
  kind: "occupantAirSpeed";
  supportsOccupantAirSpeedControl?: boolean;
};

export type OutdoorWindSpeedInputFieldSpec = {
  kind: "outdoorWindSpeed";
  minValue: number;
  maxValue: number;
  step?: number;
  decimals?: number;
};

export type PresetInputFieldSpec = {
  kind: "preset";
  presetKey: InputPresetKey;
  controlId: (typeof InputControlId)[keyof typeof InputControlId];
  fieldKey: PrimaryQuantityId;
  presetDecimals?: number;
  showClothingBuilder?: boolean;
  maxValue?: number;
  label?: string;
  applyInput?: NumericControlBehaviorConfig["applyInput"];
};

export type ModelQuantityInputFieldSpec = {
  kind: "modelQuantity";
  quantityId: PhysicalQuantityIdType;
  minValue?: number;
  maxValue?: number;
  label?: string;
};

export type InputFieldSpec =
  | NumericInputFieldSpec
  | OperativeTemperatureInputFieldSpec
  | RadiantTemperatureInputFieldSpec
  | SimpleHumidityInputFieldSpec
  | AdvancedHumidityInputFieldSpec
  | OccupantAirSpeedInputFieldSpec
  | OutdoorWindSpeedInputFieldSpec
  | PresetInputFieldSpec
  | ModelQuantityInputFieldSpec;

function convertModelQuantityFromSi(
  quantityId: PhysicalQuantityIdType,
  valueSi: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) return valueSi;
  if (quantityId === PhysicalQuantityId.PhsBodyWeight) {
    return convertMassFromSi(valueSi * 1000);
  }
  if (quantityId === PhysicalQuantityId.PhsHeight) {
    return convertLengthFromSi(valueSi);
  }
  return valueSi;
}

function convertModelQuantityToSi(
  quantityId: PhysicalQuantityIdType,
  value: number,
  unitSystem: UnitSystemType,
): number {
  if (unitSystem === UnitSystem.SI) return value;
  if (quantityId === PhysicalQuantityId.PhsBodyWeight) {
    return convertMassToSi(value) / 1000;
  }
  if (quantityId === PhysicalQuantityId.PhsHeight) {
    return convertLengthToSi(value);
  }
  return value;
}

function createModelQuantityControlBehavior(
  spec: ModelQuantityInputFieldSpec,
): InputControlBehavior {
  const meta = getPhysicalQuantityMeta(spec.quantityId);
  const minValue = spec.minValue ?? meta.minSi;
  const maxValue = spec.maxValue ?? meta.maxSi;
  const label = spec.label ?? meta.label;

  return {
    buildViewModel: (context) => {
      const display = getQuantityDisplayMeta(spec.quantityId, context.unitSystem);
      const valueSi = context.modelInputs[spec.quantityId] ?? meta.defaultSi;
      const displayValue = convertModelQuantityFromSi(
        spec.quantityId,
        valueSi,
        context.unitSystem,
      );
      const minDisplay = convertModelQuantityFromSi(
        spec.quantityId,
        minValue,
        context.unitSystem,
      );
      const maxDisplay = convertModelQuantityFromSi(
        spec.quantityId,
        maxValue,
        context.unitSystem,
      );
      const rangeText = `From ${formatDisplayValue(minDisplay, display.decimals)} to ${formatDisplayValue(maxDisplay, display.decimals)}`;
      const numericValuesByInput: Record<string, number> = {};
      const displayValuesByInput: Record<string, string> = {};
      for (const inputId of context.visibleInputIds) {
        numericValuesByInput[inputId] = displayValue;
        displayValuesByInput[inputId] = formatDisplayValue(displayValue, display.decimals);
      }

      return {
        id: spec.quantityId,
        label,
        displayUnits: display.displayUnits,
        rangeText,
        minValue: minDisplay,
        maxValue: maxDisplay,
        hidden: false,
        disabled: false,
        editorKind: "number",
        step: display.step,
        menu: null,
        presetOptions: [],
        presetDecimals: display.decimals,
        showClothingBuilder: false,
        displayValuesByInput,
        numericValuesByInput,
      };
    },
    applyInput: (context, _inputId, rawValue) => {
      if (!rawValue.trim()) return null;
      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) return null;
      const nextValue = convertModelQuantityToSi(
        spec.quantityId,
        parsedValue,
        context.unitSystem,
      );
      if (!Number.isFinite(nextValue)) return null;
      return {
        modelInputsPatch: {
          [spec.quantityId]: nextValue,
        },
      } satisfies BehaviorPatch;
    },
  };
}

export function resolveInputField(spec: InputFieldSpec): InputControlDefinition {
  switch (spec.kind) {
    case "numeric":
      return {
        id: spec.controlId,
        behavior: createControlBehavior({
          controlId: spec.controlId,
          fieldKey: spec.fieldKey,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
          ...(spec.label
            ? {
                getPresentation: (context, meta) => ({
                  ...buildDefaultPresentation(context, spec.fieldKey, {
                    minValue: spec.minValue,
                    maxValue: spec.maxValue,
                  }),
                  label: spec.label!,
                }),
              }
            : {}),
        }),
      };
    case "operativeTemperature":
      return {
        id: InputControlId.Temperature,
        behavior: createOperativeTemperatureControlBehavior(
          InputControlId.Temperature,
          spec,
        ),
      };
    case "radiantTemperature":
      return {
        id: InputControlId.RadiantTemperature,
        behavior: createControlBehavior({
          controlId: InputControlId.RadiantTemperature,
          fieldKey: PhysicalQuantityId.MeanRadiantTemperature,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
          hidden: (context) => {
            const mode = requireTemperatureMode(context.options);
            return spec.hideWhen === "operative"
              ? mode === TemperatureMode.Operative
              : mode !== TemperatureMode.Air;
          },
          ...(spec.label
            ? {
                getPresentation: (context, meta) => ({
                  ...buildDefaultPresentation(context, PhysicalQuantityId.MeanRadiantTemperature, {
                    minValue: spec.minValue,
                    maxValue: spec.maxValue,
                  }),
                  label: spec.label!,
                }),
              }
            : {}),
        }),
      };
    case "simpleHumidity":
      return {
        id: InputControlId.Humidity,
        behavior: createControlBehavior({
          controlId: InputControlId.Humidity,
          fieldKey: PhysicalQuantityId.RelativeHumidity,
        }),
      };
    case "advancedHumidity":
      return {
        id: InputControlId.Humidity,
        behavior: createHumidityControlBehavior(InputControlId.Humidity),
      };
    case "occupantAirSpeed":
      return {
        id: InputControlId.AirSpeed,
        behavior: createAirSpeedControlBehavior(InputControlId.AirSpeed, {
          supportsOccupantAirSpeedControl: spec.supportsOccupantAirSpeedControl,
        }),
      };
    case "outdoorWindSpeed":
      return {
        id: InputControlId.WindSpeed,
        behavior: createControlBehavior({
          controlId: InputControlId.WindSpeed,
          fieldKey: PhysicalQuantityId.WindSpeed,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
          getPresentation: (context, meta) => {
            const presentation = buildDefaultPresentation(context, PhysicalQuantityId.WindSpeed, {
              minValue: spec.minValue,
              maxValue: spec.maxValue,
            });
            presentation.step = spec.step ?? 1;
            presentation.decimals = spec.decimals ?? 0;
            return presentation;
          },
        }),
      };
    case "preset":
      return {
        id: spec.controlId,
        behavior: createControlBehavior({
          controlId: spec.controlId,
          fieldKey: spec.fieldKey,
          presetOptions: getInputPresetOptions(spec.presetKey),
          presetDecimals: spec.presetDecimals,
          showClothingBuilder: spec.showClothingBuilder,
          maxValue: spec.maxValue,
          applyInput: spec.applyInput,
          ...(spec.label
            ? {
                getPresentation: (context, meta) => ({
                  ...buildDefaultPresentation(context, spec.fieldKey, {
                    maxValue: spec.maxValue,
                  }),
                  label: spec.label!,
                }),
              }
            : {}),
        }),
      };
    case "modelQuantity":
      return {
        id: spec.quantityId,
        behavior: createModelQuantityControlBehavior(spec),
      };
    default: {
      const unknownSpec: never = spec;
      throw new Error(`Unknown input field spec: ${unknownSpec}`);
    }
  }
}
