import type { ModelId as ModelIdType } from "../../../models/modelIds";
import type { InputModifier } from "../../../models/inputModifiers";
import type { OptionKey as OptionKeyType } from "../../../models/inputModes";
import type { InputId as InputIdType } from "../../../models/inputSlots";
import type { ModelCalculationContext } from "../../../models/modelCalculation";
import type {
  Band,
  ComplianceSpec,
  ModelOutput,
  NumericBand,
} from "../../../models/modelCapabilities";
import type { ModelChartInstances } from "../../../models/output/chartKinds";
import type { FieldChartProfile } from "../../../models/output/fieldChartProfile";
import type { ModelTables } from "../../../models/output/tableLayouts";
import type { UnitSystem as UnitSystemType } from "../../../models/units";
import type {
  StandardId as StandardIdType,
  WorkspaceId,
} from "../../../models/workspaces";
import type { ChartBuildResult } from "../../../services/comfort/charts/chartBuildResult";
import type {
  SimulationOutputDeclaration,
} from "../../../services/comfort/charts/simulationCharts";
import type { ChartEngineRegistration } from "../../../services/comfort/charts/kinds/types";
import type {
  BehaviorPatch,
  ControlBehaviorContext,
  InputControlDefinition,
} from "../../../services/comfort/controls/types";
import type { InputFieldSpec } from "../../../services/comfort/controls/fieldInputBehaviors";
import type { ModelOptionsState, ResultSectionViewModel } from "../types";
import { ChartAxisQuantityId, PhysicalQuantityId as PhysicalQuantityIdType, type QuantityExtension } from "../../../models/physicalQuantities";

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
} from "../../../services/comfort/charts/simulationCharts";

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
  workspaceCapabilities: readonly WorkspaceId[];
  standardIds: readonly StandardIdType[];
  exploreOutputs: readonly ModelOutput[];
  modifiers: readonly InputModifier[];
  complianceProfile?: ComplianceSpec<ComplianceBand, ResultType>;
  controls: readonly InputControlDefinition[];
  inputFields: readonly InputFieldSpec[];
  quantities: {
    readonly extend: readonly QuantityExtension[];
  };
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
