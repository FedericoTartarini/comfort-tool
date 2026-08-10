import type { ChartId as ChartIdType, ModelCharts } from "../../../models/chartOptions";
import type { ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import type { PlotlyChartResponseDto } from "../../../models/comfortDtos";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";
import type { InputModifier } from "../../../models/inputModifiers";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type { ModelCalculationContext } from "../../../models/modelCalculation";
import type {
  Band,
  ChartBuildContext,
  ChartMode as ChartModeType,
  ComplianceSpec,
  ModelOutput,
  NumericBand,
} from "../../../models/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlDefinition,
} from "../../../services/comfort/controls/types";
import type { ModelOptionsState, ResultSectionViewModel } from "../types";

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

/**
 * Strongly typed declaration used while assembling one model. The builder
 * erases ResultType and ChartSourceType exactly once when producing the runtime
 * definition consumed by the controller.
 */
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
  modifiers: readonly InputModifier[];
  complianceSpec?: ComplianceSpec<ComplianceBand, ResultType>;
  controls: readonly InputControlDefinition[];
  optionHandlersByKey: Partial<Record<OptionKeyType, ModelOptionChangeHandler>>;
  charts: ModelCharts;
  defaultOptions: Partial<Record<OptionKeyType, string>>;
  parseOptions: (value: unknown) => ModelOptionsState | null;
  calculate: (
    context: ModelCalculationContext,
    visibleInputIds: InputIdType[],
  ) => ModelCalculationOutputs<ResultType, ChartSourceType>;
  buildResultSections: (
    resultsByInput: Record<InputIdType, ResultType | null>,
    visibleInputIds: InputIdType[],
    unitSystem: UnitSystemType,
  ) => ResultSectionViewModel[];
  buildChartResult: (
    chartId: ChartIdType,
    chartSource: ChartSourceType | null,
    resultsByInput: Record<InputIdType, ResultType | null>,
    context: ChartBuildContext<ComplianceBand>,
  ) => PlotlyChartResponseDto | null;
  dynamicAxisFields: readonly FieldKeyType[];
  defaultDynamicAxes: DynamicAxisDefaults;
}

/** Non-generic controller boundary shared by every registered model. */
export type RuntimeComfortModelDefinition = ComfortModelDefinition<
  unknown,
  unknown,
  Band
>;
