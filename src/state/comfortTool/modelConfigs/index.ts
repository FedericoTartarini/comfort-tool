import type { InputId as InputIdType } from "../../../models/inputSlots";
import { ComfortModel, type ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import type { ThermalZone } from "../../../models/thermalZone";
import { type FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import type {
  ChartId as ChartIdType,
  ModelCharts,
} from "../../../models/chartOptions";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlDefinition,
} from "../../../services/comfort/controls/types";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import type { ModifierId as ModifierIdType } from "../../../models/inputModifiers";
import type {
  Band,
  ChartMode as ChartModeType,
  ChartBuildContext,
  ComplianceSpec,
  ModelOutput,
  NumericBand,
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

export type ModelCalculationOutputs<ResultType, ChartSourceType> = {
  resultsByInput: Record<InputIdType, ResultType | null>;
  chartSource: ChartSourceType;
};

export type ModelOptionChangeHandler = (
  context: ControlBehaviorContext,
  nextValue: string,
) => BehaviorPatch | null;

export interface DynamicAxisDefaults {
  readonly xAxis: FieldKeyType;
  readonly yAxis: FieldKeyType;
}

export interface ComfortModelDefinition<
  ResultType,
  ChartSourceType,
  ComplianceBand extends Band = NumericBand,
> {
  id: ComfortModelType;
  label: string;
  description: string;
  modes: readonly ChartModeType[];
  chartableOutputs: readonly ModelOutput[];
  supportedModifiers: readonly ModifierIdType[];
  complianceSpec?: ComplianceSpec<ComplianceBand, ResultType>;
  controls: InputControlDefinition[];
  optionHandlersByKey: Partial<Record<OptionKeyType, ModelOptionChangeHandler>>;
  charts: ModelCharts;
  defaultOptions: Partial<Record<OptionKeyType, string>>;
  // Strictly parses a complete model-options snapshot without repairing it.
  parseOptions: (value: unknown) => ModelOptionsState | null;
  calculate: (
    context: ModelCalculationContext,
    visibleInputIds: InputIdType[],
  ) => ModelCalculationOutputs<ResultType, ChartSourceType>;
  buildResultSections: (
    resultsByInput: Record<InputIdType, ResultType | null>,
    visibleInputIds: InputIdType[],
    unitSystem: UnitSystemType,
    options: ModelOptionsState,
    selectedChartId: ChartIdType,
  ) => ResultSectionViewModel[];
  buildChartResult: (
    chartId: ChartIdType,
    chartSource: ChartSourceType | null,
    resultsByInput: Record<InputIdType, ResultType | null>,
    context: ChartBuildContext<ComplianceBand>,
  ) => PlotlyChartResponseDto | null;
  dynamicAxisFields: FieldKeyType[];
  defaultDynamicAxes: DynamicAxisDefaults;
  zones: ThermalZone[];
}

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

export const comfortModelOrder = Object.keys(comfortModelConfigs) as ComfortModelType[];

export const comfortModelMetaById = Object.fromEntries(
  Object.entries(comfortModelConfigs).map(([id, config]) => [
    id,
    { label: config.label, description: config.description }
  ])
);

export function getComfortModelConfig(modelId: ComfortModelType) {
  return comfortModelConfigs[modelId];
}
