import type { ModelId as ModelIdType } from "../../../catalog/modelIds";
import type { InputModifier } from "../../../catalog/inputModifiers";
import type { OptionKey as OptionKeyType } from "../../../catalog/inputModes";
import type { InputId as InputIdType } from "../../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../../catalog/modelCalculation";
import type {
  Band,
  ComplianceSpec,
  ModelOutput,
  NumericBand,
} from "../../../catalog/modelCapabilities";
import type { ModelChartInstances } from "../../../catalog/chartTypes";
import type { FieldChartProfile } from "../../../catalog/output/fieldChartProfile";
import type { ModelTables } from "../../../catalog/tableTypes";
import type { UnitSystem as UnitSystemType } from "../../../catalog/units";
import type {
  StandardId as StandardIdType,
  SurfaceId,
} from "../../../catalog/surfaces";
import type { ChartBuildResult } from "../../../engines/comfort/charts/chartBuildResult";
import type {
  SimulationOutputDeclaration,
} from "../../../engines/comfort/charts/simulationCharts";
import type { ChartEngineRegistration } from "../../../engines/comfort/charts/kinds/types";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlDefinition,
} from "../../../engines/comfort/controls/types";
import type { InputFieldSpec } from "../../../engines/comfort/controls/fieldInputBehaviors";
import type { ModelOptionsState, ResultSectionViewModel } from "../types";
import { ChartAxisQuantityId, PhysicalQuantityId as PhysicalQuantityIdType } from "../../../catalog/quantities";

export type ModelCalculationOutputs<ResultType, ChartSourceType> = {
  resultsByInput: Record<InputIdType, ResultType | null>;
  chartSource: ChartSourceType;
};

export type ModelOptionChangeHandler = (
  context: ControlBehaviorContext,
  nextValue: string,
) => BehaviorPatch | null;

export interface DynamicAxisDefaults {
  readonly xAxis: ChartAxisQuantityId;
  readonly yAxis: ChartAxisQuantityId;
}

export interface ChartBuildRequestContext {
  readonly unitSystem: UnitSystemType;
  readonly baselineInputId: InputIdType;
  readonly chartSourceVersion: number;
  readonly modelInputs: Readonly<Partial<Record<PhysicalQuantityIdType, number>>>;
}


export type {
  SimulationChartDeclaration,
  SimulationOutputDeclaration,
  SimulationTimeSeriesLineChartSpec,
} from "../../../engines/comfort/charts/simulationCharts";

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
  id: ModelIdType;
  label: string;
  description: string;
  workspaceCapabilities: readonly SurfaceId[];
  standardIds: readonly StandardIdType[];
  exploreOutputs: readonly ModelOutput[];
  modifiers: readonly InputModifier[];
  complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;
  controls: readonly InputControlDefinition[];
  inputFields: readonly InputFieldSpec[];
  extraQuantities: readonly PhysicalQuantityIdType[];
  optionHandlersByKey: Partial<Record<OptionKeyType, ModelOptionChangeHandler>>;
  tables: ModelTables<ResultType>;
  chartInstances: ModelChartInstances;
  chartEngineRegistrations: readonly ChartEngineRegistration<
    ResultType,
    ChartSourceType
  >[];
  defaultOptions: Partial<Record<OptionKeyType, string>>;
  parseOptions: (value: unknown) => ModelOptionsState | null;
  calculate: (
    context: ModelCalculationContext,
    visibleInputIds: InputIdType[],
  ) => ModelCalculationOutputs<ResultType, ChartSourceType>;
  buildTable: (
    resultsByInput: Record<InputIdType, ResultType | null>,
    visibleInputIds: InputIdType[],
    unitSystem: UnitSystemType,
  ) => ResultSectionViewModel[];
  buildChart: (
    instanceId: string,
    chartSource: ChartSourceType | null,
    resultsByInput: Record<InputIdType, ResultType | null>,
    profile: FieldChartProfile<ComplianceBand>,
    context: ChartBuildRequestContext,
  ) => ChartBuildResult;
  dynamicAxisFields: readonly ChartAxisQuantityId[];
  defaultDynamicAxes: DynamicAxisDefaults;
  simulation?: SimulationOutputDeclaration;
}

/** Non-generic controller boundary shared by every registered model. */
export type RuntimeComfortModelDefinition = ComfortModelDefinition<
  unknown,
  unknown,
  Band
>;
