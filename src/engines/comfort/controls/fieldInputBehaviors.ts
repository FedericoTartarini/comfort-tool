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
  getQuantityDisplayMeta,
  type PhysicalQuantityId as PhysicalQuantityIdType,
  type PrimaryInputState,
  type PrimaryQuantityId,
} from "../../../catalog/quantities";
import type { DerivedSlotQuantityState } from "../derivations/psychrometrics";
import { isExtraQuantityId } from "../quantityStateRouting";
import {
  InputWidget,
  defaultControlIdByQuantity,
  defaultFieldWidgetByQuantity,
} from "../../../catalog/inputWidgets";
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

export type ExtraQuantityInputFieldSpec = {
  kind: "quantity";
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
  | ExtraQuantityInputFieldSpec;

/** Model-file authoring: a quantity id, or quantity plus overrides. */
export type AuthoringFieldOverride = {
  quantity: PhysicalQuantityIdType;
  widget?: InputWidget;
  controlId?: (typeof InputControlId)[keyof typeof InputControlId];
  minValue?: number;
  maxValue?: number;
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
  | PrimaryQuantityId
  | PhysicalQuantityIdType
  | AuthoringFieldOverride
  | InputFieldSpec;

function isResolvedInputFieldSpec(
  field: AuthoringInputField,
): field is InputFieldSpec {
  return typeof field === "object" && "kind" in field;
}

function defaultPresetKeyForQuantity(quantity: PrimaryQuantityId): InputPresetKey {
  if (quantity === PhysicalQuantityId.MetabolicRate) {
    return InputPresetKey.MetabolicRate;
  }
  if (quantity === PhysicalQuantityId.ClothingInsulation) {
    return InputPresetKey.ClothingInsulation;
  }
  throw new Error(`Quantity ${quantity} has no default preset widget.`);
}

function specFromQuantity(
  quantity: PhysicalQuantityIdType,
  override: Omit<AuthoringFieldOverride, "quantity">,
): InputFieldSpec {
  if (isExtraQuantityId(quantity)) {
    return {
      kind: "quantity",
      quantityId: quantity,
      minValue: override.minValue,
      maxValue: override.maxValue,
      label: override.label,
    };
  }

  if (!(quantity in defaultFieldWidgetByQuantity)) {
    throw new Error(`Quantity ${quantity} has no default input widget.`);
  }
  const primaryQuantity = quantity as PrimaryQuantityId;
  const widget = override.widget ?? defaultFieldWidgetByQuantity[primaryQuantity];
  const controlId =
    override.controlId ?? defaultControlIdByQuantity[primaryQuantity];
  const meta = getPhysicalQuantityMeta(primaryQuantity);

  switch (widget) {
    case InputWidget.Numeric:
      if (controlId === undefined) {
        throw new Error(`Quantity ${quantity} has no default control id.`);
      }
      return {
        kind: "numeric",
        controlId,
        fieldKey: primaryQuantity,
        minValue: override.minValue,
        maxValue: override.maxValue,
        label: override.label,
      };
    case InputWidget.OperativeTemperature:
      return {
        kind: "operativeTemperature",
        minValue: override.minValue,
        maxValue: override.maxValue,
        postSynchronize: override.postSynchronize,
      };
    case InputWidget.RadiantTemperature:
      return {
        kind: "radiantTemperature",
        minValue: override.minValue,
        maxValue: override.maxValue,
        hideWhen: override.hideWhen ?? "operative",
        label: override.label,
      };
    case InputWidget.SimpleHumidity:
      return { kind: "simpleHumidity" };
    case InputWidget.AdvancedHumidity:
      return { kind: "advancedHumidity" };
    case InputWidget.OccupantAirSpeed:
      return {
        kind: "occupantAirSpeed",
        supportsOccupantAirSpeedControl: override.supportsOccupantAirSpeedControl,
      };
    case InputWidget.OutdoorWindSpeed:
      return {
        kind: "outdoorWindSpeed",
        minValue: override.minValue ?? meta.minSi,
        maxValue: override.maxValue ?? meta.maxSi,
        step: override.step,
      };
    case InputWidget.Preset:
      if (controlId === undefined) {
        throw new Error(`Quantity ${quantity} has no default control id.`);
      }
      return {
        kind: "preset",
        presetKey: override.presetKey ?? defaultPresetKeyForQuantity(primaryQuantity),
        controlId,
        fieldKey: primaryQuantity,
        presetDecimals: override.presetDecimals,
        showClothingBuilder: override.showClothingBuilder,
        maxValue: override.maxValue,
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
    return specFromQuantity(field, {});
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
): readonly PrimaryQuantityId[] {
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
      return [];
    default: {
      const unknownSpec: never = spec;
      throw new Error(`Unknown input field spec: ${unknownSpec}`);
    }
  }
}

export function declaredSiRangeForInputField(
  spec: InputFieldSpec,
  quantityId: PrimaryQuantityId,
): { minSi: number; maxSi: number } {
  if (!primaryQuantityIdsForInputField(spec).includes(quantityId)) {
    throw new Error(
      `Quantity ${quantityId} is not declared by input field kind "${spec.kind}".`,
    );
  }
  const meta = getPhysicalQuantityMeta(quantityId);
  const minSi =
    "minValue" in spec && spec.minValue !== undefined ? spec.minValue : meta.minSi;
  const maxSi =
    "maxValue" in spec && spec.maxValue !== undefined ? spec.maxValue : meta.maxSi;
  return { minSi, maxSi };
}

function createExtraQuantityControlBehavior(
  spec: ExtraQuantityInputFieldSpec,
): InputControlBehavior {
  const resolveMeta = () => {
    const meta = getPhysicalQuantityMeta(spec.quantityId);
    return {
      meta,
      minValue: spec.minValue ?? meta.minSi,
      maxValue: spec.maxValue ?? meta.maxSi,
      label: spec.label ?? meta.label,
    };
  };

  return {
    buildViewModel: (context) => {
      const { meta, minValue, maxValue, label } = resolveMeta();
      const display = getQuantityDisplayMeta(spec.quantityId, context.unitSystem);
      const valueSi = context.modelInputs[spec.quantityId] ?? meta.defaultSi;
      const displayValue = convertQuantityFromSi(
        spec.quantityId,
        valueSi,
        context.unitSystem,
      );
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
        numericValuesByInput[inputId] = displayValue;
        displayValuesByInput[inputId] = formatDisplayValue(displayValue);
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
        presetDecimals: 2,
        showClothingBuilder: false,
        displayValuesByInput,
        numericValuesByInput,
      };
    },
    applyInput: (context, _inputId, rawValue) => {
      if (!rawValue.trim()) return null;
      const parsedValue = Number(rawValue);
      if (!Number.isFinite(parsedValue)) return null;
      const currentSi = context.modelInputs[spec.quantityId]
        ?? getPhysicalQuantityMeta(spec.quantityId).defaultSi;
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
        }),
      };
    case "advancedHumidity":
      return {
        id: inputFieldControlId(spec),
        behavior: createHumidityControlBehavior(InputControlId.Humidity),
      };
    case "occupantAirSpeed":
      return {
        id: inputFieldControlId(spec),
        behavior: createAirSpeedControlBehavior(InputControlId.AirSpeed, {
          supportsOccupantAirSpeedControl: spec.supportsOccupantAirSpeedControl,
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
