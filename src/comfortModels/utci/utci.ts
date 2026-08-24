import type {
  ModelChartSourceDto,
} from "../../models/comfortDtos";
import { ComfortModel } from "../../models/comfortModels";
import { PhysicalQuantityId } from "../../models/physicalQuantities";
import { InputControlId } from "../../models/inputControls";
import {
  defaultUtciOptions,
  OptionKey,
  TemperatureMode,
  type UtciModelOptions,
} from "../../models/inputModes";
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ModelCalculationContext } from "../../models/modelCalculation";
import { ChartKind } from "../../models/output/chartKinds";
import { WorkspaceCapability } from "../../models/output/workspaceCapabilities";
import { TableType, type TableRowSpec } from "../../models/output/tableLayouts";
import {
  createTemperatureModeOptionHandler,
} from "../../services/comfort/controls/temperatureControl";
import {
  calculatePerInput,
} from "../../services/comfort/requestMapping";
import {
  ComfortModelBuilder,
  hasExactKeys,
  isRecord,
  type OutputChartDeclarationInput,
} from "../../state/comfortTool/modelConfigs/builder";
import {
  buildUtciResultRows,
  calculateUtci,
  UTCI_MODEL_LABEL,
  UTCI_TDB_LIMITS,
  UTCI_TR_LIMITS,
  utciOutput,
  utciRequestAdapter,
  type UtciRequestDto,
  type UtciResponseDto,
} from "./utciCalculation";
import {
  buildUtciStressChart,
  createUtciDynamicChartSpec,
} from "./utciCharts";

const MODEL_DESCRIPTION = "Outdoor UTCI with stress category visualization.";

const UTCI_DYNAMIC_AXIS_FIELDS = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.OperativeTemperature,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
] as const;

function parseUtciOptions(value: unknown): UtciModelOptions | null {
  if (!isRecord(value) || !hasExactKeys(value, [OptionKey.TemperatureMode])) {
    return null;
  }
  const mode = value[OptionKey.TemperatureMode];
  if (mode === TemperatureMode.Air || mode === TemperatureMode.Operative) {
    return { [OptionKey.TemperatureMode]: mode };
  }
  return null;
}

function toRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
): UtciRequestDto {
  const request = utciRequestAdapter.mapRequest(context, inputId);
  if (context.options[OptionKey.TemperatureMode] === TemperatureMode.Operative) {
    request.tr = request.tdb;
  }
  return request;
}

function buildUtciTableRows(): TableRowSpec<UtciResponseDto>[] {
  const rowMeta = [
    { id: "utci", label: UTCI_MODEL_LABEL },
    { id: "stress-category", label: "Stress Category" },
  ];
  return rowMeta.map((meta, index) => ({
    id: meta.id,
    label: meta.label,
    format: (result, unitSystem) => (
      buildUtciResultRows(unitSystem)[index].formatter(result)
    ),
  }));
}

const builder = new ComfortModelBuilder<
  UtciResponseDto,
  ModelChartSourceDto<UtciRequestDto>
>(
  ComfortModel.Utci,
);

const utciOutputCharts: OutputChartDeclarationInput[] = [
  {
    instanceId: "utci-stress-band",
    kind: ChartKind.BandScalar,
    name: "UTCI",
    emptyMessage: "No psychrometric chart yet.",
    capabilities: {
      allowsAxisSelection: false,
      locksYAxis: false,
      allowsOutputSelection: false,
      allowsBandEditing: false,
      allowsBaselineSelection: true,
      showsZoneToggle: false,
      showsLegend: true,
      showsExport: true,
    },
    spec: {
      build: (
        chartSource: import("../../models/comfortDtos").ModelChartSourceDto<import("./utciCalculation").UtciRequestDto> | null,
        resultsByInput: Partial<Record<import("../../models/inputSlots").InputId, import("./utciCalculation").UtciResponseDto | null>>,
        context: import("../../models/modelCapabilities").ChartBuildContext<import("../../models/modelCapabilities").NumericBand>,
      ) => {
        if (!chartSource) return null;
        return buildUtciStressChart(chartSource, resultsByInput, context);
      },
    },
  },
  {
    instanceId: "utci-dynamic-field",
    kind: ChartKind.DynamicField,
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    capabilities: {
      allowsAxisSelection: true,
      locksYAxis: false,
      allowsOutputSelection: true,
      allowsBandEditing: true,
      allowsBaselineSelection: true,
      showsZoneToggle: false,
      showsLegend: true,
      showsExport: true,
    },
    spec: {
      title: `${UTCI_MODEL_LABEL} Dynamic Chart`,
      axisFields: [...UTCI_DYNAMIC_AXIS_FIELDS],
      resolveGridSpec: () => createUtciDynamicChartSpec(),
    },
  },
];

builder
  .setLabel(UTCI_MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setStandardIds([])
  .setWorkspaceCapabilities([WorkspaceCapability.Explore])
  .setExploreOutputs([utciOutput])
  .setModifiers([])
  .setOutputCharts(utciOutputCharts, {
    defaultInstanceId: "utci-stress-band",
  });

builder.setInputFields([
  {
    kind: "operativeTemperature",
    minValue: UTCI_TDB_LIMITS.min,
    maxValue: UTCI_TDB_LIMITS.max,
  },
  {
    kind: "radiantTemperature",
    minValue: UTCI_TR_LIMITS.min,
    maxValue: UTCI_TR_LIMITS.max,
    hideWhen: "operative",
  },
  {
    kind: "numeric",
    controlId: InputControlId.WindSpeed,
    fieldKey: PhysicalQuantityId.WindSpeed,
  },
  { kind: "simpleHumidity" },
]);

builder.addOptionHandler(
  OptionKey.TemperatureMode,
  createTemperatureModeOptionHandler(),
);

builder.setDynamicAxisFields([...UTCI_DYNAMIC_AXIS_FIELDS]);
builder.setDefaultDynamicAxes({
  xAxis: PhysicalQuantityId.DryBulbTemperature,
  yAxis: PhysicalQuantityId.RelativeHumidity,
});
builder.setDefaultOptions({ ...defaultUtciOptions });
builder.setOptionParser(parseUtciOptions);

builder.setCalculator((context, visibleInputIds) =>
  calculatePerInput({
    context,
    visibleInputIds,
    mapRequest: toRequest,
    calculate: calculateUtci,
  }));

builder.setTables({
  analysis: {
    type: TableType.Analysis,
    rows: buildUtciTableRows(),
  },
});

export const utciModelConfig = builder.build();

// Re-export calculation API for existing importers of ./utci
export {
  buildUtciResultRows,
  calculateUtci,
  getUtciZoneMeta,
  tryEvaluateUtciForChart,
  utciAxisAdapter,
  utciOutput,
  utciRequestAdapter,
  utciZonesList,
  type UtciRequestDto,
  type UtciResponseDto,
} from "./utciCalculation";
