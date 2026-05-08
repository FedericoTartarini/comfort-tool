/**
 * Registered comfort-model definitions.
 * Definitions declare reusable input controls plus the calculation entrypoint for each model.
 */
import type { InputId as InputIdType } from "../../../models/inputSlots";
import { ComfortModel, type ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import type { ChartId as ChartIdType } from "../../../models/chartOptions";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlDefinition,
} from "../../../services/comfort/controls/types";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import type { ComfortToolStateSlice, ModelOptionsState, ResultSectionViewModel } from "../types";
import { pmvModelConfig } from "./pmv";
import { utciModelConfig } from "./utci";
import { adaptiveAshraeModelConfig, adaptiveEnModelConfig } from "./adaptive";
import { heatIndexModelConfig, humidexModelConfig, windChillModelConfig } from "./thermalIndices";

/**
 * Type for model calculation outputs, containing results by input and chart source.
 * @template ResultType - The type of the calculation results.
 * @template ChartSourceType - The type of the chart source.
 */
export type ModelCalculationOutputs<ResultType, ChartSourceType> = {
  resultsByInput: Record<InputIdType, ResultType | null>;
  chartSource: ChartSourceType;
};

/**
 * Type for model option change handler, used to handle changes in model options.
 * @param context - The control behavior context.
 * @param nextValue - The next value of the option.
 * @returns The behavior patch.
 */
export type ModelOptionChangeHandler = (
  context: ControlBehaviorContext,
  nextValue: string,
) => BehaviorPatch | null;

/**
 * Type for comfort model definition, containing model information and calculation logic.
 * @template ResultType - The type of the calculation results.
 * @template ChartSourceType - The type of the chart source.
 */
export interface ComfortModelDefinition<ResultType, ChartSourceType> {
  id: ComfortModelType;
  controls: InputControlDefinition[];
  optionHandlersByKey: Partial<Record<OptionKeyType, ModelOptionChangeHandler>>;
  chartIds: ChartIdType[];
  defaultChartId: ChartIdType;
  defaultOptions: Partial<Record<OptionKeyType, string>>;
  // Normalizes model options from unknown values to ModelOptionsState.
  normalizeOptions: (value: unknown) => ModelOptionsState | null;
  // Calculates model results from state and visible inputs
  calculate: (
    state: ComfortToolStateSlice,
    visibleInputIds: InputIdType[],
  ) => ModelCalculationOutputs<ResultType, ChartSourceType>;
  // Builds the result sections to display for the model
  buildResultSections: (
    resultsByInput: Record<InputIdType, ResultType | null>,
    visibleInputIds: InputIdType[],
    unitSystem: UnitSystemType,
    options: ModelOptionsState,
    selectedChartId: ChartIdType,
  ) => ResultSectionViewModel[];
  // Builds the chart result to display for the model
  buildChartResult: (
    chartId: ChartIdType,
    chartSource: ChartSourceType | null,
    resultsByInput: Record<InputIdType, ResultType | null>,
    unitSystem: UnitSystemType,
  ) => PlotlyChartResponseDto | null;
  dynamicAxisFields: FieldKeyType[];
}

// Specific comfort model configurations, keyed by model id
export const comfortModelConfigs = {
  [ComfortModel.Pmv]: pmvModelConfig,
  [ComfortModel.Utci]: utciModelConfig,
  [ComfortModel.AdaptiveAshrae]: adaptiveAshraeModelConfig,
  [ComfortModel.AdaptiveEn]: adaptiveEnModelConfig,
  [ComfortModel.HeatIndex]: heatIndexModelConfig,
  [ComfortModel.Humidex]: humidexModelConfig,
  [ComfortModel.WindChill]: windChillModelConfig,
} as const;

// Gets the model config for a given model id
export function getComfortModelConfig(modelId: ComfortModelType) {
  return comfortModelConfigs[modelId];
}
