import { InputControlId } from "../../../catalog/inputControls";
import { TemperatureMode, OptionKey, type ModelOptionsRecord } from "../../../catalog/inputModes";
import {
  convertQuantityFromSi,
  convertQuantityToSi,
  formatDisplayValue,
  roundToDisplay,
} from "../../units";
import { createHumidityControlBehavior } from "./humidityControl";
import {
  buildDefaultPresentation,
  createAirSpeedControlBehavior,
  createControlBehavior,
  type NumericControlBehaviorConfig,
} from "./numericControl";
import {
  getInputPresetOptions,
  InputPresetKey,
} from "./inputControlPresets";
import {
  createOperativeTemperatureControlBehavior,
} from "./temperatureControl";
import type { BehaviorPatch, InputControlBehavior, InputControlDefinition } from "./types";
import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type QuantityState,
} from "../../../catalog/quantities";
import { unitLabel } from "../../../catalog/units";
import type { DerivedSlotQuantityState } from "../derivations/psychrometrics";
import {
  InputWidget,
  defaultControlIdByQuantity,
  defaultFieldWidgetByQuantity,
} from "../../../catalog/inputWidgets";
type PostTemperatureSynchronizer = (
  inputState: QuantityState,
  derivedState: DerivedSlotQuantityState,
  options: ModelOptionsRecord,
) => QuantityState;

export type NumericInputFieldSpec = {
  kind: "numeric";
  controlId: (typeof InputControlId)[keyof typeof InputControlId];
  fieldKey: PhysicalQuantityIdType;
  minValue: number;
  maxValue: number;
  label?: string;
};

export type OperativeTemperatureInputFieldSpec = {
  kind: "operativeTemperature";
  minValue: number;
  maxValue: number;
  postSynchronize?: PostTemperatureSynchronizer;
};

export type RadiantTemperatureInputFieldSpec = {
  kind: "radiantTemperature";
  minValue: number;
  maxValue: number;
  hideWhen: "operative" | "air";
  label?: string;
};

export type SimpleHumidityInputFieldSpec = {
  kind: "simpleHumidity";
  minValue: number;
  maxValue: number;
};

export type AdvancedHumidityInputFieldSpec = {
  kind: "advancedHumidity";
  minValue: number;
  maxValue: number;
};

export type OccupantAirSpeedInputFieldSpec = {
  kind: "occupantAirSpeed";
  minValue: number;
  maxValue: number;
  supportsOccupantAirSpeedControl?: boolean;
};

export type OutdoorWindSpeedInputFieldSpec = {
  kind: "outdoorWindSpeed";
  minValue: number;
  maxValue: number;
  step?: number;
};

export type PresetInputFieldSpec = {
  kind: "preset";
  presetKey: InputPresetKey;
  controlId: (typeof InputControlId)[keyof typeof InputControlId];
  fieldKey: PhysicalQuantityIdType;
  minValue: number;
  maxValue: number;
  presetDecimals?: number;
  showClothingBuilder?: boolean;
  label?: string;
  applyInput?: NumericControlBehaviorConfig["applyInput"];
};

export type ExtraQuantityInputFieldSpec = {
  kind: "quantity";
  quantityId: PhysicalQuantityIdType;
  minValue: number;
  maxValue: number;
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
  | ExtraQuantityInputFieldSpec;

/** Model-file authoring: a quantity id, or quantity plus overrides. */
export type AuthoringFieldOverride = {
  quantity: PhysicalQuantityIdType;
  widget?: InputWidget;
  controlId?: (typeof InputControlId)[keyof typeof InputControlId];
  minValue: number;
  maxValue: number;
  step?: number;
  label?: string;
  hideWhen?: "operative" | "air";
  supportsOccupantAirSpeedControl?: boolean;
  presetKey?: InputPresetKey;
  presetDecimals?: number;
  showClothingBuilder?: boolean;
  applyInput?: NumericControlBehaviorConfig["applyInput"];
  postSynchronize?: PostTemperatureSynchronizer;
};

export type AuthoringInputField =
  | PhysicalQuantityIdType
  | AuthoringFieldOverride
  | InputFieldSpec;

function isResolvedInputFieldSpec(
  field: AuthoringInputField,
): field is InputFieldSpec {
  return typeof field === "object" && "kind" in field;
}

function defaultPresetKeyForQuantity(quantity: PhysicalQuantityIdType): InputPresetKey {
  if (quantity === PhysicalQuantityId.MetabolicRate) {
    return InputPresetKey.MetabolicRate;
  }
  if (quantity === PhysicalQuantityId.ClothingInsulation) {
    return InputPresetKey.ClothingInsulation;
  }
  throw new Error(`Quantity ${quantity} has no default preset widget.`);
}

function requireAuthoringRange(
  quantity: PhysicalQuantityIdType,
  override: Omit<AuthoringFieldOverride, "quantity">,
): { minValue: number; maxValue: number } {
  if (override.minValue === undefined || override.maxValue === undefined) {
    throw new Error(
      `Input field ${quantity} must declare SI minValue and maxValue.`,
    );
  }
  return { minValue: override.minValue, maxValue: override.maxValue };
}

function specFromQuantity(
  quantity: PhysicalQuantityIdType,
  override: Omit<AuthoringFieldOverride, "quantity">,
): InputFieldSpec {
  const range = requireAuthoringRange(quantity, override);
  const widget = override.widget ?? defaultFieldWidgetByQuantity[quantity];
  if (widget === undefined) {
    return {
      kind: "quantity",
      quantityId: quantity,
      minValue: range.minValue,
      maxValue: range.maxValue,
      label: override.label,
    };
  }
  const controlId =
    override.controlId ?? defaultControlIdByQuantity[quantity];

  switch (widget) {
    case InputWidget.Numeric:
      if (controlId === undefined) {
        throw new Error(`Quantity ${quantity} has no default control id.`);
      }
      return {
        kind: "numeric",
        controlId,
        fieldKey: quantity,
        minValue: range.minValue,
        maxValue: range.maxValue,
        label: override.label,
      };
    case InputWidget.OperativeTemperature:
      return {
        kind: "operativeTemperature",
        minValue: range.minValue,
        maxValue: range.maxValue,
        postSynchronize: override.postSynchronize,
      };
    case InputWidget.RadiantTemperature:
      return {
        kind: "radiantTemperature",
        minValue: range.minValue,
        maxValue: range.maxValue,
        hideWhen: override.hideWhen ?? "operative",
        label: override.label,
      };
    case InputWidget.SimpleHumidity:
      return {
        kind: "simpleHumidity",
        minValue: range.minValue,
        maxValue: range.maxValue,
      };
    case InputWidget.AdvancedHumidity:
      return {
        kind: "advancedHumidity",
        minValue: range.minValue,
        maxValue: range.maxValue,
      };
    case InputWidget.OccupantAirSpeed:
      return {
        kind: "occupantAirSpeed",
        minValue: range.minValue,
        maxValue: range.maxValue,
        supportsOccupantAirSpeedControl: override.supportsOccupantAirSpeedControl,
      };
    case InputWidget.OutdoorWindSpeed:
      return {
        kind: "outdoorWindSpeed",
        minValue: range.minValue,
        maxValue: range.maxValue,
        step: override.step,
      };
    case InputWidget.Preset:
      if (controlId === undefined) {
        throw new Error(`Quantity ${quantity} has no default control id.`);
      }
      return {
        kind: "preset",
        presetKey: override.presetKey ?? defaultPresetKeyForQuantity(quantity),
        controlId,
        fieldKey: quantity,
        minValue: range.minValue,
        maxValue: range.maxValue,
        presetDecimals: override.presetDecimals,
        showClothingBuilder: override.showClothingBuilder,
        label: override.label,
        applyInput: override.applyInput,
      };
    default: {
      const unknownWidget: never = widget;
      throw new Error(`Unknown input widget: ${String(unknownWidget)}`);
    }
  }
}

export function resolveAuthoringInputField(
  field: AuthoringInputField,
): InputFieldSpec {
  if (typeof field === "string") {
    throw new Error(
      `Input field ${field} must declare SI minValue and maxValue.`,
    );
  }
  if (isResolvedInputFieldSpec(field)) {
    return field;
  }
  const { quantity, ...override } = field;
  return specFromQuantity(quantity, override);
}

export type InputFieldControlId = InputControlDefinition["id"];

export function inputFieldControlId(spec: InputFieldSpec): InputFieldControlId {
  switch (spec.kind) {
    case "numeric":
    case "preset":
      return spec.controlId;
    case "operativeTemperature":
      return InputControlId.Temperature;
    case "radiantTemperature":
      return InputControlId.RadiantTemperature;
    case "simpleHumidity":
    case "advancedHumidity":
      return InputControlId.Humidity;
    case "occupantAirSpeed":
      return InputControlId.AirSpeed;
    case "outdoorWindSpeed":
      return InputControlId.WindSpeed;
    case "quantity":
      return spec.quantityId;
    default: {
      const unknownSpec: never = spec;
      throw new Error(`Unknown input field spec: ${unknownSpec}`);
    }
  }
}

export function primaryQuantityIdsForInputField(
  spec: InputFieldSpec,
): readonly PhysicalQuantityIdType[] {
  switch (spec.kind) {
    case "numeric":
    case "preset":
      return [spec.fieldKey];
    case "operativeTemperature":
      return [PhysicalQuantityId.DryBulbTemperature];
    case "radiantTemperature":
      return [PhysicalQuantityId.MeanRadiantTemperature];
    case "simpleHumidity":
    case "advancedHumidity":
      return [PhysicalQuantityId.RelativeHumidity];
    case "occupantAirSpeed":
      return [PhysicalQuantityId.RelativeAirSpeed];
    case "outdoorWindSpeed":
      return [PhysicalQuantityId.WindSpeed];
    case "quantity":
      return [spec.quantityId];
    default: {
      const unknownSpec: never = spec;
      throw new Error(`Unknown input field spec: ${unknownSpec}`);
    }
  }
}

export function declaredSiRangeForInputField(
  spec: InputFieldSpec,
  quantityId: PhysicalQuantityIdType,
): { minSi: number; maxSi: number } {
  if (!primaryQuantityIdsForInputField(spec).includes(quantityId)) {
    throw new Error(
      `Quantity ${quantityId} is not declared by input field kind "${spec.kind}".`,
    );
  }
  return { minSi: spec.minValue, maxSi: spec.maxValue };
}

function createExtraQuantityControlBehavior(
  spec: ExtraQuantityInputFieldSpec,
): InputControlBehavior {
  const resolveMeta = () => {
    const meta = getPhysicalQuantityMeta(spec.quantityId);
    return {
      meta,
      minValue: spec.minValue,
      maxValue: spec.maxValue,
      label: spec.label ?? meta.label,
    };
  };

  return {
    buildViewModel: (context) => {
      const { meta, minValue, maxValue, label } = resolveMeta();
      const displayUnits = unitLabel(meta.siUnit, context.unitSystem);
      const step = meta.step;
      const minDisplay = convertQuantityFromSi(
        spec.quantityId,
        minValue,
        context.unitSystem,
      );
      const maxDisplay = convertQuantityFromSi(
        spec.quantityId,
        maxValue,
        context.unitSystem,
      );
      const rangeText = `From ${formatDisplayValue(minDisplay)} to ${formatDisplayValue(maxDisplay)}`;
      const numericValuesByInput: Record<string, number> = {};
      const displayValuesByInput: Record<string, string> = {};
      for (const inputId of context.visibleInputIds) {
        const slotValueSi = context.quantitiesByInput[inputId][spec.quantityId]
          ?? spec.minValue;
        const slotDisplay = convertQuantityFromSi(
          spec.quantityId,
          slotValueSi,
          context.unitSystem,
        );
        numericValuesByInput[inputId] = slotDisplay;
        displayValuesByInput[inputId] = formatDisplayValue(slotDisplay);
      }

      return {
        id: spec.quantityId,
        label,
        displayUnits,
        rangeText,
        minValue: minDisplay,
        maxValue: maxDisplay,
        hidden: false,
        disabled: false,
        editorKind: "number",
        step,
        menu: null,
        presetOptions: [],
        presetDecimals: 2,
        showClothingBuilder: false,
        displayValuesByInput,
        numericValuesByInput,
      };
    },
    applyInput: (context, inputId, rawValue) => {
      if (!rawValue.trim()) return null;
      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) return null;
      const currentSi = context.quantitiesByInput[inputId][spec.quantityId]
        ?? spec.minValue;
      const currentDisplay = formatDisplayValue(
        convertQuantityFromSi(spec.quantityId, currentSi, context.unitSystem),
      );
      if (rawValue.trim() === currentDisplay) return null;
      const displayValue = roundToDisplay(parsedValue);
      if (formatDisplayValue(displayValue) === currentDisplay) return null;
      const nextValue = convertQuantityToSi(
        spec.quantityId,
        displayValue,
        context.unitSystem,
      );
      if (!Number.isFinite(nextValue)) return null;
      return {
        quantitiesPatch: {
          [inputId]: {
            ...context.quantitiesByInput[inputId],
            [spec.quantityId]: nextValue,
          },
        },
      } satisfies BehaviorPatch;
    },
  };
}

export function resolveInputField(spec: InputFieldSpec): InputControlDefinition {
  switch (spec.kind) {
    case "numeric":
      return {
        id: inputFieldControlId(spec),
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
        id: inputFieldControlId(spec),
        behavior: createOperativeTemperatureControlBehavior(
          InputControlId.Temperature,
          spec,
        ),
      };
    case "radiantTemperature":
      return {
        id: inputFieldControlId(spec),
        behavior: createControlBehavior({
          controlId: InputControlId.RadiantTemperature,
          fieldKey: PhysicalQuantityId.MeanRadiantTemperature,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
          hidden: (context) => {
            const mode = context.options[OptionKey.TemperatureMode];
            if (
              mode !== TemperatureMode.Air
              && mode !== TemperatureMode.Operative
            ) {
              return false;
            }
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
        id: inputFieldControlId(spec),
        behavior: createControlBehavior({
          controlId: InputControlId.Humidity,
          fieldKey: PhysicalQuantityId.RelativeHumidity,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
        }),
      };
    case "advancedHumidity":
      return {
        id: inputFieldControlId(spec),
        behavior: createHumidityControlBehavior(InputControlId.Humidity, {
          min: spec.minValue,
          max: spec.maxValue,
        }),
      };
    case "occupantAirSpeed":
      return {
        id: inputFieldControlId(spec),
        behavior: createAirSpeedControlBehavior(InputControlId.AirSpeed, {
          supportsOccupantAirSpeedControl: spec.supportsOccupantAirSpeedControl,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
        }),
      };
    case "outdoorWindSpeed":
      return {
        id: inputFieldControlId(spec),
        behavior: createControlBehavior({
          controlId: InputControlId.WindSpeed,
          fieldKey: PhysicalQuantityId.WindSpeed,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
          getPresentation: (context) => {
            const presentation = buildDefaultPresentation(context, PhysicalQuantityId.WindSpeed, {
              minValue: spec.minValue,
              maxValue: spec.maxValue,
            });
            presentation.step = spec.step ?? 1;
            return presentation;
          },
        }),
      };
    case "preset":
      return {
        id: inputFieldControlId(spec),
        behavior: createControlBehavior({
          controlId: spec.controlId,
          fieldKey: spec.fieldKey,
          presetOptions: getInputPresetOptions(spec.presetKey),
          presetDecimals: spec.presetDecimals,
          showClothingBuilder: spec.showClothingBuilder,
          minValue: spec.minValue,
          maxValue: spec.maxValue,
          applyInput: spec.applyInput,
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
    case "quantity":
      return {
        id: inputFieldControlId(spec),
        behavior: createExtraQuantityControlBehavior(spec),
      };
    default: {
      const unknownSpec: never = spec;
      throw new Error(`Unknown input field spec: ${unknownSpec}`);
    }
  }
}
