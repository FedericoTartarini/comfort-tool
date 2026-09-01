/** Session ↔ share DTO. Snapshot encodes input + chart only. */
import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import {
  type PhysicalQuantityId,
  type QuantityState,
} from "../../../catalog/quantities";
import type { OptionKey as OptionKeyType } from "../../../catalog/inputModes";
import {
  modifierOrder,
  modifierQuantityIds,
  type ModifierId as ModifierIdType,
} from "../../../catalog/inputModifiers";
import {
  InputId,
  inputOrder,
  type InputId as InputIdType,
} from "../../../catalog/inputSlots";
import { type NumericBand } from "../../../catalog/modelCapabilities";
import { type UnitSystem as UnitSystemType } from "../../../catalog/units";
import { syncDerivedState } from "../../../engines/comfort/syncState";
import { omitDerivedHumidity } from "../../../engines/comfort/quantityStateRouting";
import { seedModelOutputSettings } from "../fieldChartState";
import { comfortModelOrder, getComfortModelConfig } from "../../modelRegistry";
import { createInputState } from "../initialPointSessionState";
import type {
  ActiveModifiersByInputState,
  PointSessionBuckets,
  ModelOutputSettings,
} from "../sessionTypes";

export { modifierQuantityIds };

export interface ShareModelOutputSettings {
  xAxis: PhysicalQuantityId;
  yAxis: PhysicalQuantityId;
  baselineInputId: InputIdType;
  exploreOutput: PhysicalQuantityId | null;
  exploreBands: NumericBand[] | null;
}

export interface ShareStateSnapshot {
  version: 1;
  models: Record<
    ModelIdType,
    {
      selectedChartType: string;
      options: Partial<Record<OptionKeyType, string>>;
      outputSettings: ShareModelOutputSettings;
    }
  >;
  compareEnabled: boolean;
  compareInputIds: InputIdType[];
  activeInputId: InputIdType;
  unitSystem: UnitSystemType;
  quantitiesByInput: Record<InputIdType, QuantityState>;
  activeModifiersByInput: ActiveModifiersByInputState;
}

export type ShareModelSnapshot = ShareStateSnapshot["models"][ModelIdType];

export function cloneOutputSettings(
  settings: ModelOutputSettings,
): ShareModelOutputSettings {
  return {
    xAxis: settings.xAxis,
    yAxis: settings.yAxis,
    baselineInputId: settings.baselineInputId,
    exploreOutput: settings.exploreOutput,
    exploreBands: settings.exploreBands
      ? settings.exploreBands.map((band) => ({ ...band }))
      : null,
  };
}

export function createDefaultModelSnapshot(
  modelId: ModelIdType,
): ShareModelSnapshot {
  const config = getComfortModelConfig(modelId);
  return {
    selectedChartType: config.chartInstances.defaultInstanceId,
    options: { ...config.defaultOptions },
    outputSettings: cloneOutputSettings(seedModelOutputSettings(config)),
  };
}

export function createShareStateSnapshot(
  session: Pick<PointSessionBuckets, "input" | "chart">,
): ShareStateSnapshot {
  return {
    version: 1,
    models: comfortModelOrder.reduce(
      (accumulator, modelId) => {
        accumulator[modelId] = {
          selectedChartType:
            session.chart.selectedChartInstanceByModel[modelId],
          options: { ...session.input.modelOptionsByModel[modelId] },
          outputSettings: cloneOutputSettings(
            session.chart.outputSettingsByModel[modelId],
          ),
        };
        return accumulator;
      },
      {} as ShareStateSnapshot["models"],
    ),
    compareEnabled: session.input.compareEnabled,
    compareInputIds: [...session.input.compareInputIds],
    activeInputId: session.input.activeInputId,
    unitSystem: session.input.unitSystem,
    quantitiesByInput: {
      [InputId.Input1]: omitDerivedHumidity(session.input.quantitiesByInput[InputId.Input1]),
      [InputId.Input2]: omitDerivedHumidity(session.input.quantitiesByInput[InputId.Input2]),
      [InputId.Input3]: omitDerivedHumidity(session.input.quantitiesByInput[InputId.Input3]),
    },
    activeModifiersByInput: inputOrder.reduce((byInput, inputId) => {
      byInput[inputId] = modifierOrder.reduce(
        (byModifier, modifierId) => {
          byModifier[modifierId] =
            session.input.activeModifiersByInput[inputId][modifierId];
          return byModifier;
        },
        {} as Record<ModifierIdType, boolean>,
      );
      return byInput;
    }, {} as ActiveModifiersByInputState),
  };
}

export function applyShareSnapshotToState(
  session: Pick<PointSessionBuckets, "input" | "chart">,
  snapshot: ShareStateSnapshot,
) {
  for (const modelId of comfortModelOrder) {
    const modelSnapshot =
      snapshot.models[modelId] ?? createDefaultModelSnapshot(modelId);
    session.chart.selectedChartInstanceByModel[modelId] =
      modelSnapshot.selectedChartType;
    session.input.modelOptionsByModel[modelId] = { ...modelSnapshot.options };
    session.chart.outputSettingsByModel[modelId] = cloneOutputSettings(
      modelSnapshot.outputSettings,
    );
  }
  session.input.compareEnabled = snapshot.compareEnabled;
  session.input.compareInputIds = [...snapshot.compareInputIds];
  session.input.activeInputId = snapshot.activeInputId;
  session.input.unitSystem = snapshot.unitSystem;

  for (const inputId of inputOrder) {
    session.input.quantitiesByInput[inputId] = {
      ...createInputState(inputId),
      ...snapshot.quantitiesByInput[inputId],
    };
    for (const modifierId of modifierOrder) {
      session.input.activeModifiersByInput[inputId][modifierId] =
        snapshot.activeModifiersByInput[inputId][modifierId];
    }
  }
  syncDerivedState(session.input.quantitiesByInput);
}
