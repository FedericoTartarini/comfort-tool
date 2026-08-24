import type { ModelChartSourceDto } from "../../models/comfortDtos";
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../../models/physicalQuantities";
import { InputControlId } from "../../models/inputControls";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ModelOutput,
} from "../../models/modelCapabilities";
import type { ThermalZone } from "../../models/thermalZone";
import { WorkspaceCapability } from "../../models/output/workspaceCapabilities";
import { TableLayout } from "../../models/output/tableLayouts";
import { type GridModelChartSpec } from "../../services/comfort/charts/gridModelCharts";
import type { ChartRange } from "../../services/comfort/charts/types";
import { requireThermalZone } from "../../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
  type FieldRequestAdapter,
} from "../../services/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../../services/units";
import type { RuntimeComfortModelDefinition } from "../../state/comfortTool/modelConfigs/definition";
import {
  ComfortModelBuilder,
  parseEmptyOptions,
  type OutputChartDeclarationInput,
} from "../../state/comfortTool/modelConfigs/builder";
import { ChartKind } from "../../models/output/chartKinds";

export interface PsychrometricIndexRequestDto {
  tdb: number;
  rh: number;
}

export interface PsychrometricIndexModelOptions<TResult> {
  readonly comfortModel: ComfortModelType;
  readonly label: string;
  readonly description: string;
  readonly outputKey: ModelOutputKey;
  readonly zones: readonly ThermalZone[];
  readonly tdbLimits: ChartRange;
  readonly fixedChartInstanceId: string;
  readonly dynamicChartInstanceId: string;
  readonly fixedChartTitle: string;
  readonly dynamicTitle: string;
  readonly calculate: (payload: PsychrometricIndexRequestDto) => TResult;
  readonly getOutputValue: (result: TResult) => number;
  readonly getResultSubtext: (result: TResult) => string;
}

function createPsychrometricIndexChartSpec<TResult>(
  options: PsychrometricIndexModelOptions<TResult>,
  requestAdapter: Pick<
    FieldRequestAdapter<PsychrometricIndexRequestDto>,
    "getAxisValue" | "setAxisValue"
  >,
  output: ModelOutput,
): Omit<
  GridModelChartSpec<PsychrometricIndexRequestDto, TResult>,
  "instanceId" | "dynamicTitle"
> {
  return {
    output,
    axisRanges: {
      [PhysicalQuantityId.DryBulbTemperature]: options.tdbLimits,
    },
    requestAdapter,
    evaluate: options.calculate,
    getOutputValue: (result, _outputKey) => options.getOutputValue(result),
  };
}

export function buildPsychrometricIndexModelConfig<TResult>(
  options: PsychrometricIndexModelOptions<TResult>,
): RuntimeComfortModelDefinition {
  const requestAdapter = createFieldRequestAdapter<PsychrometricIndexRequestDto>({
    tdb: PhysicalQuantityId.DryBulbTemperature,
    rh: PhysicalQuantityId.RelativeHumidity,
  });

  const output: ModelOutput = {
    key: options.outputKey,
    label: options.label,
    defaultBands: bandsFromThermalZones(options.zones),
  };

  const chartSpec = createPsychrometricIndexChartSpec(
    options,
    requestAdapter,
    output,
  );

  const builder = new ComfortModelBuilder<
    TResult,
    ModelChartSourceDto<PsychrometricIndexRequestDto>
  >(options.comfortModel);

  const psychrometricAxisFields = [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.RelativeHumidity,
  ] as const;
  const outputCharts: OutputChartDeclarationInput[] = [
    {
      instanceId: options.fixedChartInstanceId,
      kind: ChartKind.DynamicField,
      name: "Psychrometric",
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
        title: options.fixedChartTitle,
        axisFields: [...psychrometricAxisFields],
        lockedAxes: {
          xField: PhysicalQuantityId.RelativeHumidity,
          yField: PhysicalQuantityId.DryBulbTemperature,
          xRangeSi: {
            min: getPhysicalQuantityMeta(PhysicalQuantityId.RelativeHumidity).minSi,
            max: getPhysicalQuantityMeta(PhysicalQuantityId.RelativeHumidity).maxSi,
          },
          yRangeSi: options.tdbLimits,
        },
        resolveGridSpec: () => chartSpec,
      },
    },
    {
      instanceId: options.dynamicChartInstanceId,
      kind: ChartKind.DynamicField,
      name: "Dynamic",
      emptyMessage: "No dynamic chart yet.",
      capabilities: {
        allowsAxisSelection: true,
        locksYAxis: true,
        allowsOutputSelection: true,
        allowsBandEditing: true,
        allowsBaselineSelection: true,
        showsZoneToggle: false,
        showsLegend: true,
        showsExport: true,
      },
      spec: {
        title: options.dynamicTitle,
        axisFields: [...psychrometricAxisFields],
        resolveGridSpec: () => chartSpec,
      },
    },
  ];

  builder
    .setLabel(options.label)
    .setDescription(options.description)
    .setStandardIds([])
    .setWorkspaceCapabilities([WorkspaceCapability.Explore])
    .setExploreOutputs([output])
    .setModifiers([])
    .setOutputCharts(outputCharts, {
      defaultInstanceId: options.fixedChartInstanceId,
    });

  builder.setInputFields([
    {
      kind: "numeric",
      controlId: InputControlId.Temperature,
      fieldKey: PhysicalQuantityId.DryBulbTemperature,
      minValue: options.tdbLimits.min,
      maxValue: options.tdbLimits.max,
    },
    { kind: "simpleHumidity" },
  ]);

  builder.setCalculator((context, visibleInputIds) =>
    calculatePerInput({
      context,
      visibleInputIds,
      mapRequest: requestAdapter.mapRequest,
      calculate: options.calculate,
    }));

  builder.setOutputTable({
    layout: TableLayout.CompareMatrix,
    rows: [{
      id: options.label.toLowerCase().replace(/\s+/g, "-"),
      label: options.label,
      format: (result, unitSystem) => {
        const outputMeta = getModelOutputDisplayMeta(options.outputKey, unitSystem);
        const value = convertModelOutputFromSi(
          options.outputKey,
          options.getOutputValue(result),
          unitSystem,
        );
        const color = requireThermalZone(
          options.zones,
          options.getOutputValue(result),
          options.label,
        ).textColor;
        const cell = {
          text: formatDisplayValue(value, outputMeta.decimals),
          subtext: options.getResultSubtext(result),
          color,
        };
        if (outputMeta.displayUnits) {
          cell.text = `${cell.text} ${outputMeta.displayUnits}`;
        }
        return cell;
      },
    }],
  });

  builder.setDefaultDynamicAxes({
    xAxis: PhysicalQuantityId.DryBulbTemperature,
    yAxis: PhysicalQuantityId.RelativeHumidity,
  });
  builder.setDefaultOptions({});
  builder.setOptionParser(parseEmptyOptions);

  return builder.build();
}
