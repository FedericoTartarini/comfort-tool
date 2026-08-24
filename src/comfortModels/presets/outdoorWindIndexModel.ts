import type { ModelChartSourceDto } from "../../models/comfortDtos";
import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";
import { PhysicalQuantityId } from "../../models/physicalQuantities";
import { InputControlId } from "../../models/inputControls";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ModelOutput,
} from "../../models/modelCapabilities";
import type { ThermalZone } from "../../models/thermalZone";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import { WorkspaceCapability } from "../../models/output/workspaceCapabilities";
import { TableLayout, type TableRowSpec } from "../../models/output/tableLayouts";
import {
  type GridModelChartSpec,
  type GridModelDynamicHoverExtension,
} from "../../services/comfort/charts/gridModelCharts";
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
  type ResultRowDefinition,
} from "../../state/comfortTool/modelConfigs/builder";
import { ChartKind } from "../../models/output/chartKinds";

export interface OutdoorWindIndexRequestDto {
  tdb: number;
  v: number;
}

export interface OutdoorWindIndexModelOptions<TResult> {
  readonly comfortModel: ComfortModelType;
  readonly label: string;
  readonly description: string;
  readonly outputKey: ModelOutputKey;
  readonly outputLabel?: string;
  readonly zones: readonly ThermalZone[];
  readonly tdbLimits: ChartRange;
  readonly windLimits: ChartRange;
  readonly dynamicChartInstanceId: string;
  readonly dynamicTitle: string;
  readonly bandLabel?: string;
  readonly calculate: (payload: OutdoorWindIndexRequestDto) => TResult;
  readonly getOutputValue: (result: TResult) => number;
  readonly getResultSubtext?: (result: TResult) => string;
  readonly resultRows?: (
    unitSystem: UnitSystemType,
    options: Pick<
      OutdoorWindIndexModelOptions<TResult>,
      "label" | "outputKey" | "zones"
    >,
  ) => ResultRowDefinition<TResult>[];
  readonly dynamicHoverExtension?: GridModelDynamicHoverExtension<TResult>;
}

function createOutdoorWindIndexChartSpec<TResult>(
  options: OutdoorWindIndexModelOptions<TResult>,
  requestAdapter: Pick<
    FieldRequestAdapter<OutdoorWindIndexRequestDto>,
    "getAxisValue" | "setAxisValue"
  >,
  output: ModelOutput,
): Omit<
  GridModelChartSpec<OutdoorWindIndexRequestDto, TResult>,
  "instanceId" | "dynamicTitle"
> {
  return {
    output,
    bandLabel: options.bandLabel,
    dynamicHoverExtension: options.dynamicHoverExtension,
    axisRanges: {
      [PhysicalQuantityId.DryBulbTemperature]: options.tdbLimits,
      [PhysicalQuantityId.WindSpeed]: options.windLimits,
    },
    requestAdapter,
    evaluate: options.calculate,
    getOutputValue: (result, _outputKey) => options.getOutputValue(result),
  };
}

function buildOutdoorWindTableRows<TResult>(
  options: OutdoorWindIndexModelOptions<TResult>,
): TableRowSpec<TResult>[] {
  if (options.resultRows) {
    const rowMeta = options.resultRows(UnitSystem.SI, {
      label: options.label,
      outputKey: options.outputKey,
      zones: options.zones,
    });
    return rowMeta.map((row, index) => ({
      id: row.title.toLowerCase().replace(/\s+/g, "-"),
      label: row.title,
      ...(row.group ? { group: row.group } : {}),
      format: (result, unitSystem) => (
        options.resultRows!(
          unitSystem,
          {
            label: options.label,
            outputKey: options.outputKey,
            zones: options.zones,
          },
        )[index].formatter(result)
      ),
    }));
  }

  return [{
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
        subtext: options.getResultSubtext?.(result) ?? "",
        color,
      };
      if (outputMeta.displayUnits) {
        cell.text = `${cell.text} ${outputMeta.displayUnits}`;
      }
      return cell;
    },
  }];
}

export function buildOutdoorWindIndexModelConfig<TResult>(
  options: OutdoorWindIndexModelOptions<TResult>,
): RuntimeComfortModelDefinition {
  const requestAdapter = createFieldRequestAdapter<OutdoorWindIndexRequestDto>({
    tdb: PhysicalQuantityId.DryBulbTemperature,
    v: PhysicalQuantityId.WindSpeed,
  });

  const output: ModelOutput = {
    key: options.outputKey,
    label: options.outputLabel ?? options.label,
    defaultBands: bandsFromThermalZones(options.zones),
  };

  const chartSpec = createOutdoorWindIndexChartSpec(
    options,
    requestAdapter,
    output,
  );

  const builder = new ComfortModelBuilder<
    TResult,
    ModelChartSourceDto<OutdoorWindIndexRequestDto>
  >(options.comfortModel);

  builder
    .setLabel(options.label)
    .setDescription(options.description)
    .setStandardIds([])
    .setWorkspaceCapabilities([WorkspaceCapability.Explore])
    .setExploreOutputs([output])
    .setModifiers([])
    .setOutputCharts([
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
          axisFields: [
            PhysicalQuantityId.DryBulbTemperature,
            PhysicalQuantityId.WindSpeed,
          ],
          resolveGridSpec: () => chartSpec,
        },
      } satisfies OutputChartDeclarationInput,
    ], { defaultInstanceId: options.dynamicChartInstanceId });

  builder.setInputFields([
    {
      kind: "numeric",
      controlId: InputControlId.Temperature,
      fieldKey: PhysicalQuantityId.DryBulbTemperature,
      minValue: options.tdbLimits.min,
      maxValue: options.tdbLimits.max,
    },
    {
      kind: "outdoorWindSpeed",
      minValue: options.windLimits.min,
      maxValue: options.windLimits.max,
    },
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
    rows: buildOutdoorWindTableRows(options),
  });

  builder.setDynamicAxisFields([
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.WindSpeed,
  ]);
  builder.setDefaultDynamicAxes({
    xAxis: PhysicalQuantityId.DryBulbTemperature,
    yAxis: PhysicalQuantityId.WindSpeed,
  });
  builder.setDefaultOptions({});
  builder.setOptionParser(parseEmptyOptions);

  return builder.build();
}
