import type { ModelChartSource } from "../../catalog/chartSource";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { ModelId } from "../../catalog/modelIds";
import { InputControlId } from "../../catalog/inputControls";
import {
  defaultUtciOptions,
  OptionKey,
  TemperatureMode,
  type UtciModelOptions,
} from "../../catalog/inputModes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import { ChartType } from "../../catalog/chartTypes";
import { SurfaceId } from "../../catalog/surfaces";
import type { TableRowAuthoring } from "../../catalog/tableTypes";
import {
  createTemperatureModeOptionHandler,
} from "../../engines/comfort/controls/temperatureControl";
import {
  calculatePerInput,
} from "../../engines/comfort/requestMapping";
import {
  ComfortModelBuilder,
  hasExactKeys,
  isRecord,
  type FrontendChartDeclaration,
} from "../../state/modelRegistry/builder";
import {
  calculateUtci,
  getUtciZoneMeta,
  UTCI_MODEL_LABEL,
  UTCI_TDB_LIMITS,
  UTCI_TR_LIMITS,
  utciOutput,
  utciRequestAdapter,
  type UtciRequest,
  type UtciResponse,
} from "./calculation";
import {
  UTCI_DYNAMIC_AXIS_FIELDS,
  utciDynamicFieldChartSpec,
  utciStressChartSpec,
} from "./charts";

const MODEL_DESCRIPTION = "Outdoor UTCI with stress category visualization.";

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
): UtciRequest {
  const request = utciRequestAdapter.mapRequest(context, inputId);
  if (context.options[OptionKey.TemperatureMode] === TemperatureMode.Operative) {
    request.tr = request.tdb;
  }
  return request;
}

function buildUtciTableRows(): TableRowAuthoring<UtciResponse>[] {
  return [
    {
      quantity: PhysicalQuantityId.Utci,
      label: UTCI_MODEL_LABEL,
    },
    {
      id: "stress-category",
      label: "Stress Category",
      format: (result) => {
        const zone = getUtciZoneMeta(result.utci);
        return { text: zone.label, color: zone.textColor };
      },
    },
  ];
}

const builder = new ComfortModelBuilder<
  UtciResponse,
  ModelChartSource<UtciRequest>
>(
  ModelId.Utci,
);

const utciCharts: FrontendChartDeclaration<
  UtciResponse,
  ModelChartSource<UtciRequest>
>[] = [
  {
    id: "utci-stress-band",
    type: ChartType.Utci,
    emptyMessage: "No psychrometric chart yet.",
    spec: utciStressChartSpec,
  },
  {
    id: "utci-dynamic-field",
    type: ChartType.Dynamic,
    emptyMessage: "No dynamic chart yet.",
    spec: utciDynamicFieldChartSpec,
  },
];

builder
  .setLabel(UTCI_MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setStandardIds([])
  .setSurfaceCapabilities([SurfaceId.Explore])
  .setExploreOutputs([utciOutput])
  .setModifiers([])
  .setCharts(utciCharts, {
    defaultChartId: "utci-stress-band",
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
builder.setDefaultDynamicAxes({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity });
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
  results: buildUtciTableRows(),
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
  type UtciRequest,
  type UtciResponse,
} from "./calculation";
