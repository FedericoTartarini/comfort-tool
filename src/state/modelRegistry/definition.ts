import type { ModelId as ModelIdType } from "../../catalog/modelIds";
import type { InputModifier } from "../../catalog/inputModifiers";
import type { OptionKey as OptionKeyType } from "../../catalog/inputModes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import type {
  Band,
  ComplianceSpec,
  ModelOutput,
  NumericBand,
} from "../../catalog/modelCapabilities";
import type { ModelChartInstances } from "../../catalog/chartTypes";
import type { FieldChartProfile } from "../../catalog/fieldChartProfile";
import type { ModelTables, TableBuildContext, TableRowSpec } from "../../catalog/tableTypes";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import type {
  StandardId as StandardIdType,
} from "../../catalog/surfaces";
import type { ChartBuildResult } from "../../engines/comfort/charts/chartBuildResult";
import type {
  SimulationOutputDeclaration,
} from "../../engines/comfort/charts/simulationCharts";
import type { ChartEngineRegistration } from "../../engines/comfort/charts/kinds/types";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlDefinition,
} from "../../engines/comfort/controls/types";
import type { InputFieldSpec } from "../../engines/comfort/controls/fieldInputBehaviors";
import type { ModelOptionsState, ResultSectionViewModel } from "../pointSession/types";
import { type PhysicalQuantityId, type PhysicalQuantityId as PhysicalQuantityIdType, type QuantityState } from "../../catalog/quantities";

export type ModelCalculationOutputs<ChartSourceType = unknown> = {
  valuesByInput: Record<InputIdType, QuantityState | null>;
  chartSource: ChartSourceType;
};

export type ModelOptionChangeHandler = (
  context: ControlBehaviorContext,
  nextValue: string,
) => BehaviorPatch | null;

export interface DynamicAxisDefaults {
  readonly xAxis: PhysicalQuantityId;
  readonly yAxis: PhysicalQuantityId;
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
} from "../../engines/comfort/charts/simulationCharts";

export interface RuntimeTimeSeriesFeature {
  readonly rows: readonly TableRowSpec[];
  readonly simulation: SimulationOutputDeclaration;
}

/**
 * Runtime model used by the session. Result scalars are always QuantityState;
 * ChartSourceType is the only remaining generic (PMV geometry, PHS extras).
 */
export interface ComfortModelDefinition<
  ChartSourceType = unknown,
  ComplianceBand extends Band = NumericBand,
> {
  id: ModelIdType;
  label: string;
  description: string;
  exploreMode: boolean;
  standardIds: readonly StandardIdType[];
  exploreOutputs: readonly ModelOutput[];
  modifiers: readonly InputModifier[];
  complianceProfile?: ComplianceSpec<ComplianceBand>;
  controls: readonly InputControlDefinition[];
  inputFields: readonly InputFieldSpec[];
  optionHandlersByKey: Partial<Record<OptionKeyType, ModelOptionChangeHandler>>;
  tables: ModelTables;
  timeSeries?: RuntimeTimeSeriesFeature;
  chartInstances: ModelChartInstances;
  chartEngineRegistrations: readonly ChartEngineRegistration<
    QuantityState,
    ChartSourceType
  >[];
  defaultOptions: Partial<Record<OptionKeyType, string>>;
  parseOptions: (value: unknown) => ModelOptionsState | null;
  calculate: (
    context: ModelCalculationContext,
    visibleInputIds: InputIdType[],
  ) => ModelCalculationOutputs<ChartSourceType>;
  buildTable: (
    valuesByInput: Record<InputIdType, QuantityState | null>,
    visibleInputIds: InputIdType[],
    unitSystem: UnitSystemType,
    tableContext?: TableBuildContext,
  ) => ResultSectionViewModel[];
  buildChart: (
    instanceId: string,
    chartSource: ChartSourceType | null,
    valuesByInput: Record<InputIdType, QuantityState | null>,
    profile: FieldChartProfile<ComplianceBand>,
    context: ChartBuildRequestContext,
  ) => ChartBuildResult;
  dynamicAxisFields: readonly PhysicalQuantityId[];
  defaultDynamicAxes: DynamicAxisDefaults;
  simulation?: SimulationOutputDeclaration;
}

/** Non-generic controller boundary shared by every registered model. */
export type RuntimeComfortModelDefinition = ComfortModelDefinition<unknown, Band>;

export function modelSupportsStandard(
  config: Pick<RuntimeComfortModelDefinition, "standardIds">,
): boolean {
  return config.standardIds.length > 0;
}

export function modelSupportsExplore(
  config: Pick<RuntimeComfortModelDefinition, "exploreMode">,
): boolean {
  return config.exploreMode;
}

export function modelSupportsTimeSeries(
  config: Pick<RuntimeComfortModelDefinition, "timeSeries">,
): boolean {
  return config.timeSeries !== undefined;
}
