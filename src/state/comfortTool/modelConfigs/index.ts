/**
 * Registered comfort-model definitions.
 * Definitions declare reusable input controls plus the calculation entrypoint for each model.
 */
import type { InputId as InputIdType } from "../../../models/inputSlots";
import { ComfortModel, type ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import type { ThermalZone } from "../../../models/thermalZone";
import { type FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import type { ChartId as ChartIdType } from "../../../models/chartOptions";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlDefinition,
} from "../../../services/comfort/controls/types";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import type {
  Band,
  ChartMode as ChartModeType,
  ChartBuildContext,
  ComplianceSpec,
  ModelOutput,
} from "../../../models/modelCapabilities";
import type { ModelCalculationContext } from "../../../models/modelCalculation";
import type { ModelOptionsState, ResultSectionViewModel } from "../types";
import { pmvAshraeModelConfig } from "../../../comfortModels/pmvAshrae";
import { pmvIsoModelConfig } from "../../../comfortModels/pmvIso";
import { utciModelConfig } from "../../../comfortModels/utci";
import { adaptiveAshraeModelConfig } from "../../../comfortModels/adaptiveAshrae";
import { adaptiveEnModelConfig } from "../../../comfortModels/adaptiveEn";
import { heatIndexModelConfig } from "../../../comfortModels/heatIndex";
import { humidexModelConfig } from "../../../comfortModels/humidex";
import { windChillModelConfig } from "../../../comfortModels/windChill";

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

export interface DynamicAxisDefaults {
  readonly xAxis: FieldKeyType;
  readonly yAxis: FieldKeyType;
}

/**
 * Type for comfort model definition, containing model information and calculation logic.
 * @template ResultType - The type of the calculation results.
 * @template ChartSourceType - The type of the chart source.
 */
export interface ComfortModelDefinition<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = Band,
> {
  id: ComfortModelType;
  label: string;
  description: string;
  modes: readonly ChartModeType[];
  chartableOutputs: readonly ModelOutput[];
  complianceSpec?: ComplianceSpec<ComplianceBand>;
  controls: InputControlDefinition[];
  optionHandlersByKey: Partial<Record<OptionKeyType, ModelOptionChangeHandler>>;
  chartIds: ChartIdType[];
  defaultChartId: ChartIdType;
  defaultOptions: Partial<Record<OptionKeyType, string>>;
  // Normalizes model options from unknown values to ModelOptionsState.
  normalizeOptions: (value: unknown) => ModelOptionsState | null;
  // Calculates model results from canonical SI inputs and model options.
  calculate: (
    context: ModelCalculationContext,
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
    context: ChartBuildContext,
  ) => PlotlyChartResponseDto | null;
  dynamicAxisFields: FieldKeyType[];
  defaultDynamicAxes: DynamicAxisDefaults;
  zones: ThermalZone[];
  legendChartIds: ChartIdType[];
  legendTitle: string;
  lockYAxisChartIds: ChartIdType[];
}

// Model Registry: Mapping of comfort model ids to their definitions
export const comfortModelConfigs = {
  [ComfortModel.PmvAshrae]: pmvAshraeModelConfig,
  [ComfortModel.PmvIso]: pmvIsoModelConfig,
  [ComfortModel.Utci]: utciModelConfig,
  [ComfortModel.AdaptiveAshrae]: adaptiveAshraeModelConfig,
  [ComfortModel.AdaptiveEn]: adaptiveEnModelConfig,
  [ComfortModel.HeatIndex]: heatIndexModelConfig,
  [ComfortModel.Humidex]: humidexModelConfig,
  [ComfortModel.WindChill]: windChillModelConfig,
} as const;

// Comfort model order based on registry keys
export const comfortModelOrder = Object.keys(comfortModelConfigs) as ComfortModelType[];

// Comfort model metadata for dropdown (label, description)
export const comfortModelMetaById = Object.fromEntries(
  Object.entries(comfortModelConfigs).map(([id, config]) => [
    id,
    { label: config.label, description: config.description }
  ])
);

// Gets the model config for a given model id
export function getComfortModelConfig(modelId: ComfortModelType) {
  return comfortModelConfigs[modelId];
}
