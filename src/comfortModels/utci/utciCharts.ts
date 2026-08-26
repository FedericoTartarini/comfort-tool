import { CalculationSource } from "../../models/calculationMetadata";
import type {
  ModelChartSource,
  PlotlyChartResponseDto,
} from "../../models/comfortDtos";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../../models/physicalQuantities";
import type { InputId as InputIdType } from "../../models/inputSlots";
import {
  findNumericBandIndexForValue,
  ModelOutputKey,
  type ChartBuildContext,
  type NumericBand,
} from "../../models/modelCapabilities";
import {
  buildFieldChart,
  createBandedGridStrategy,
  type FieldChartInputGroup,
} from "../../services/comfort/charts/fieldChartEngine";
import {
  applyDynamicAxisCoordinates,
} from "../../services/comfort/charts/dynamicAxisPayload";
import {
  type GridModelChartSpec,
} from "../../services/comfort/charts/gridModelCharts";
import { INTERACTIVE_DYNAMIC_GRID_POINTS } from "../../services/comfort/charts/types";
import type {
  BandScalarChartEngineSpec,
  DynamicFieldChartEngineSpec,
} from "../../services/comfort/charts/kinds/types";
import { buildTextAnnotation } from "../../services/comfort/charts/plotlyBuilders";
import {
  getCompareInputs,
} from "../../services/comfort/helpers";
import { convertModelOutputFromSi } from "../../services/units";
import {
  calculateUtci,
  tryEvaluateUtciForChart,
  UTCI_CHART_RANGE_SI,
  UTCI_MODEL_LABEL,
  utciAxisAdapter,
  utciOutput,
  utciZonesList,
  type UtciRequest,
  type UtciResponse,
} from "./utciCalculation";

const MODEL_LABEL = UTCI_MODEL_LABEL;
const STRESS_BAND_Y_RESOLUTION = 50;
const STRESS_BAND_X_RESOLUTION = 450;
const MULTI_INPUT_MARKER_Y_POSITIONS = [0.78, 0.5, 0.22];
const SINGLE_INPUT_MARKER_Y_POSITION = [0.5];
const ZONE_ANNOTATION_Y_STAGGER = { even: 0.05, odd: 0.16 };
const UTCI_STRESS_CHART_MARGIN = { l: 56, r: 24, t: 48, b: 80 };
const UTCI_DYNAMIC_CHART_MARGIN = { l: 64, r: 24, t: 48, b: 64 };

export function createUtciDynamicChartSpec(): Omit<
  GridModelChartSpec<UtciRequest, UtciResponse>,
  "instanceId" | "dynamicTitle"
> {
  return {
    output: utciOutput,
    gridPoints: INTERACTIVE_DYNAMIC_GRID_POINTS,
    requestAdapter: utciAxisAdapter,
    chartAxisAdapter: utciAxisAdapter,
    applyChartCoordinates: (payload, xField, xSi, yField, ySi) => (
      applyDynamicAxisCoordinates(
        payload,
        { field: xField, valueSi: xSi },
        { field: yField, valueSi: ySi },
        utciAxisAdapter,
      )
    ),
    evaluate: calculateUtci,
    tryEvaluatePayload: tryEvaluateUtciForChart,
    getOutputValue: (result) => result.utci,
    dynamicViewLayout: {
      margin: UTCI_DYNAMIC_CHART_MARGIN,
      showGrid: false,
      zeroLine: false,
      legend: { orientation: "h", x: 0, y: 1.1 },
    },
  };
}


export function buildUtciStressChart(
  source: ModelChartSource<UtciRequest>,
  resultsByInput: Partial<Record<InputIdType, UtciResponse | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto {
  const config = context.fieldChartConfig;
  const fixedConfig = {
    ...config,
    xField: PhysicalQuantityId.DryBulbTemperature,
    yField: PhysicalQuantityId.RelativeHumidity,
  };
  const { unitSystem } = context;
  const inputs = getCompareInputs(source.inputs);
  const markerPositions = inputs.length > 1
    ? MULTI_INPUT_MARKER_Y_POSITIONS
    : SINGLE_INPUT_MARKER_Y_POSITION;
  const yByInput = new Map(
    inputs.map(({ inputId }, index) => [inputId, markerPositions[index] ?? 0.5]),
  );
  const temperatureUnits =
    getQuantityPresentationMeta(PhysicalQuantityId.DryBulbTemperature, unitSystem).displayUnits;
  const annotations = config.bands.flatMap((band, index) => {
    const min = Math.max(band.min, UTCI_CHART_RANGE_SI.min);
    const max = Math.min(band.max, UTCI_CHART_RANGE_SI.max);
    if (min >= max) return [];
    const defaultZone = utciZonesList.find(({ label }) => label === band.label);
    return [buildTextAnnotation({
      x: convertModelOutputFromSi(
        ModelOutputKey.Utci,
        (min + max) / 2,
        unitSystem,
      ),
      y: index % 2 === 0
        ? ZONE_ANNOTATION_Y_STAGGER.even
        : ZONE_ANNOTATION_Y_STAGGER.odd,
      text: defaultZone?.legendText ?? band.label,
    })];
  });
  const getResult = (payload: UtciRequest, inputId: InputIdType) =>
    resultsByInput[inputId] ?? calculateUtci(payload);

  return buildFieldChart({
    unitSystem,
    xAxis: {
      field: PhysicalQuantityId.DryBulbTemperature,
      rangeSi: UTCI_CHART_RANGE_SI,
      points: STRESS_BAND_X_RESOLUTION,
      label: MODEL_LABEL,
      showGrid: false,
      zeroLine: false,
    },
    yAxis: {
      field: PhysicalQuantityId.RelativeHumidity,
      rangeSi: { min: 0, max: 1 },
      points: STRESS_BAND_Y_RESOLUTION,
      label: "",
      units: "",
      toDisplay: (value) => value,
      toSi: (value) => value,
      showTickLabels: false,
    },
    strategy: createBandedGridStrategy({
      config: fixedConfig,
      output: utciOutput,
      bandLabel: "Stress Category",
      hoverTemplate: `UTCI: %{x:.1f} ${temperatureUnits}<br><b>Stress Category: %{text}</b><extra></extra>`,
      opacity: 0.75,
      evaluateOutput: (utciValueSi) => utciValueSi,
    }),
    inputGroups: () => [{
      inputsMap: source.inputs,
      resultsByInput,
      getXSi: (payload, inputId) => getResult(payload, inputId).utci,
      getYSi: (_, inputId) => yByInput.get(inputId) ?? 0.5,
      getHovertemplate: ({ inputLabel, payload, inputId }) => {
        const result = getResult(payload, inputId);
        const bandIndex = findNumericBandIndexForValue(
          config.bands,
          result.utci,
        );
        const bandLabel = bandIndex === undefined
          ? "Unclassified"
          : config.bands[bandIndex].label;
        return `${inputLabel}<br>UTCI: %{x:.1f} ${temperatureUnits}<br><b>Stress Category: ${bandLabel}</b><extra></extra>`;
      },
      markerSize: 14,
    } satisfies FieldChartInputGroup<UtciRequest, UtciResponse>],
    annotations,
    layout: {
      title: `${MODEL_LABEL} stress category`,
      margin: UTCI_STRESS_CHART_MARGIN,
      legend: { orientation: "h", x: 0, y: 1.08 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export const UTCI_DYNAMIC_AXIS_FIELDS = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.OperativeTemperature,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
] as const;

export const utciStressChartSpec: BandScalarChartEngineSpec<
  UtciResponse,
  ModelChartSource<UtciRequest>
> = {
  build: (chartSource, resultsByInput, context) => {
    if (!chartSource) return null;
    return buildUtciStressChart(
      chartSource,
      resultsByInput,
      context as ChartBuildContext<NumericBand>,
    );
  },
};

export const utciDynamicFieldChartSpec: DynamicFieldChartEngineSpec<UtciResponse> = {
  title: `${UTCI_MODEL_LABEL} Dynamic Chart`,
  axisFields: [...UTCI_DYNAMIC_AXIS_FIELDS],
  resolveGridSpec: () => createUtciDynamicChartSpec(),
};
