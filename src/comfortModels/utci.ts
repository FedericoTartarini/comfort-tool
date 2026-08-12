import { t_o, utci } from "jsthermalcomfort";
import { CalculationSource } from "../models/calculationMetadata";
import { ChartId } from "../models/chartOptions";
import type {
  ModelChartSourceDto,
  PlotlyChartResponseDto,
} from "../models/comfortDtos";
import { ComfortModel, JsThermalComfortStandard } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { InputControlId } from "../models/inputControls";
import {
  defaultUtciOptions,
  OptionKey,
  TemperatureMode,
  type UtciModelOptions,
} from "../models/inputModes";
import type { InputId as InputIdType } from "../models/inputSlots";
import type { ModelCalculationContext } from "../models/modelCalculation";
import {
  bandsFromThermalZones,
  ChartMode,
  findNumericBandIndexForValue,
  ModelOutputKey,
  type ChartBuildContext,
  type ModelOutput,
  type NumericBand,
} from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import { UnitSystem } from "../models/units";
import {
  buildFieldChart,
  createBandedGridStrategy,
  type FieldChartInputGroup,
} from "../services/comfort/charts/chartEngine";
import {
  applyDynamicAxisCoordinates,
  createRequestAxisAdapter,
} from "../services/comfort/charts/dynamicAxisPayload";
import {
  buildTextAnnotation,
} from "../services/comfort/charts/plotlyBuilders";
import {
  createControlBehavior,
} from "../services/comfort/controls/numericControl";
import {
  createOperativeTemperatureControlBehavior,
  createTemperatureModeOptionHandler,
  requireTemperatureMode,
} from "../services/comfort/controls/temperatureControl";
import {
  getBaselineInputEntry,
  getCompareInputs,
  requireThermalZone,
  roundValue,
} from "../services/comfort/helpers";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../services/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  buildResultSection,
  ComfortModelBuilder,
  hasExactKeys,
  isRecord,
} from "../state/comfortTool/modelConfigs/builder";

const MODEL_LABEL = "UTCI";
const MODEL_DESCRIPTION = "Outdoor UTCI with stress category visualization.";
const STRESS_BAND_Y_RESOLUTION = 50;
const CONTOUR_GRID_RESOLUTION = 450;
const MULTI_INPUT_MARKER_Y_POSITIONS = [0.78, 0.5, 0.22];
const SINGLE_INPUT_MARKER_Y_POSITION = [0.5];
const ZONE_ANNOTATION_Y_STAGGER = { even: 0.05, odd: 0.16 };
const UTCI_STRESS_CHART_MARGIN = { l: 56, r: 24, t: 48, b: 80 };
const UTCI_DYNAMIC_CHART_MARGIN = { l: 64, r: 24, t: 48, b: 64 };

export const utciZonesList = [
  new ThermalZone({ category: "extreme cold stress", label: "Extreme Cold Stress", legendText: "Ext.<br>cold", max: -40, color: "#0f172a", textColor: "#64748b" }),
  new ThermalZone({ category: "very strong cold stress", label: "Very Strong Cold Stress", legendText: "V strong<br>cold", min: -40, max: -27, color: "#1d4ed8", textColor: "#2563eb" }),
  new ThermalZone({ category: "strong cold stress", label: "Strong Cold Stress", legendText: "Strong<br>cold", min: -27, max: -13, color: "#2563eb", textColor: "#3b82f6" }),
  new ThermalZone({ category: "moderate cold stress", label: "Moderate Cold Stress", legendText: "Moderate<br>cold", min: -13, max: 0, color: "#3b82f6", textColor: "#60a5fa" }),
  new ThermalZone({ category: "slight cold stress", label: "Slight Cold Stress", legendText: "Slight<br>cold", min: 0, max: 9, color: "#7dd3fc", textColor: "#0284c7" }),
  new ThermalZone({ category: "no thermal stress", label: "No Thermal Stress", legendText: "No<br>stress", min: 9, max: 26, color: "#34d399", textColor: "#059669" }),
  new ThermalZone({ category: "moderate heat stress", label: "Moderate Heat Stress", legendText: "Moderate<br>heat", min: 26, max: 32, color: "#fbbf24", textColor: "#d97706" }),
  new ThermalZone({ category: "strong heat stress", label: "Strong Heat Stress", legendText: "Strong<br>heat", min: 32, max: 38, color: "#fb923c", textColor: "#ea580c" }),
  new ThermalZone({ category: "very strong heat stress", label: "Very Strong Heat Stress", legendText: "V strong<br>heat", min: 38, max: 46, color: "#f97316", textColor: "#c2410c" }),
  new ThermalZone({ category: "extreme heat stress", label: "Extreme Heat Stress", legendText: "Ext.<br>heat", min: 46, color: "#dc2626", textColor: "#b91c1c" }),
];

const utciOutput: ModelOutput = {
  key: ModelOutputKey.Utci,
  label: MODEL_LABEL,
  defaultBands: bandsFromThermalZones(utciZonesList),
};

const UTCI_CHART_RANGE_SI = { min: -50, max: 55 } as const;
const TDB_LIMITS = { min: UTCI_CHART_RANGE_SI.min, max: 50 };
const TR_LIMITS = { min: -80, max: 120 };
const UTCI_DYNAMIC_AXIS_FIELDS = [
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.OperativeTemperature,
  FieldKey.WindSpeed,
  FieldKey.RelativeHumidity,
] as const;

export interface UtciRequestDto {
  tdb: number;
  tr: number;
  v: number;
  rh: number;
}

export interface UtciResponseDto {
  utci: number;
  stressCategory: string;
  source: CalculationSource;
}

export function getUtciZoneMeta(value: number): ThermalZone {
  return requireThermalZone(utciZonesList, value, MODEL_LABEL);
}

function evaluateUtciSi(payload: UtciRequestDto): number {
  return utci(
    payload.tdb,
    payload.tr,
    payload.v,
    payload.rh,
    UnitSystem.SI,
    false,
    false,
  ).utci;
}

export function calculateUtci(payload: UtciRequestDto): UtciResponseDto {
  const value = evaluateUtciSi(payload);
  const zone = getUtciZoneMeta(value);
  if (!zone.category) {
    throw new Error(`UTCI zone has no stress category: ${zone.label}`);
  }

  return {
    utci: value,
    stressCategory: zone.category,
    source: CalculationSource.JsThermalComfort,
  };
}

/** Returns null only for a model-domain point that cannot be plotted. */
export function tryEvaluateUtciForChart(payload: UtciRequestDto): number | null {
  const value = evaluateUtciSi(payload);
  return Number.isFinite(value) ? value : null;
}

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

export const utciRequestAdapter = createFieldRequestAdapter<UtciRequestDto>({
  tdb: FieldKey.DryBulbTemperature,
  tr: FieldKey.MeanRadiantTemperature,
  v: FieldKey.WindSpeed,
  rh: FieldKey.RelativeHumidity,
});

export const utciAxisAdapter = createRequestAxisAdapter({
  fieldAdapter: utciRequestAdapter,
  aliases: {
    [FieldKey.RelativeAirSpeed]: FieldKey.WindSpeed,
  },
  temperatureComponentRanges: {
    [FieldKey.DryBulbTemperature]: TDB_LIMITS,
    [FieldKey.MeanRadiantTemperature]: TR_LIMITS,
  },
  operativeTemperature: {
    get: (request) => t_o(
      request.tdb,
      request.tr,
      request.v,
      JsThermalComfortStandard.ISO,
    ),
    set: (request, valueSi) => {
      request.tdb = valueSi;
      request.tr = valueSi;
    },
    range: {
      min: fieldMetaByKey[FieldKey.OperativeTemperature].minValue,
      max: fieldMetaByKey[FieldKey.OperativeTemperature].maxValue,
    },
  },
});

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

export function buildUtciStressChart(
  source: ModelChartSourceDto<UtciRequestDto>,
  resultsByInput: Partial<Record<InputIdType, UtciResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto {
  const config = context.fieldChartConfig;
  const fixedConfig = {
    ...config,
    xField: FieldKey.DryBulbTemperature,
    yField: FieldKey.RelativeHumidity,
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
    fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
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
  const getResult = (payload: UtciRequestDto, inputId: InputIdType) =>
    resultsByInput[inputId] ?? calculateUtci(payload);

  return buildFieldChart({
    unitSystem,
    xAxis: {
      field: FieldKey.DryBulbTemperature,
      rangeSi: UTCI_CHART_RANGE_SI,
      points: CONTOUR_GRID_RESOLUTION,
      label: MODEL_LABEL,
      showGrid: false,
      zeroLine: false,
    },
    yAxis: {
      field: FieldKey.RelativeHumidity,
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
    } satisfies FieldChartInputGroup<UtciRequestDto, UtciResponseDto>],
    annotations,
    layout: {
      title: `${MODEL_LABEL} stress category`,
      margin: UTCI_STRESS_CHART_MARGIN,
      legend: { orientation: "h", x: 0, y: 1.08 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

export function buildUtciDynamicChart(
  source: ModelChartSourceDto<UtciRequestDto>,
  resultsByInput: Partial<Record<InputIdType, UtciResponseDto | null>>,
  context: ChartBuildContext<NumericBand>,
): PlotlyChartResponseDto {
  const config = context.fieldChartConfig;
  const baseline = getBaselineInputEntry(
    source.inputs,
    context.baselineInputId,
  );
  const output = utciOutput;

  const { unitSystem } = context;
  const outputMeta = getModelOutputDisplayMeta(output.key, unitSystem);
  const outputUnits = outputMeta.displayUnits ? ` ${outputMeta.displayUnits}` : "";
  return buildFieldChart({
    unitSystem,
    xAxis: {
      field: config.xField,
      points: CONTOUR_GRID_RESOLUTION,
    },
    yAxis: {
      field: config.yField,
      points: CONTOUR_GRID_RESOLUTION,
    },
    strategy: createBandedGridStrategy({
      config,
      output,
      evaluateOutput: (xSi, ySi) => {
        const request = { ...baseline.payload };
        const hasValidCoordinates = applyDynamicAxisCoordinates(
          request,
          { field: config.xField, valueSi: xSi },
          { field: config.yField, valueSi: ySi },
          utciAxisAdapter,
        );
        return hasValidCoordinates ? tryEvaluateUtciForChart(request) : null;
      },
    }),
    inputGroups: ({ xAxis, yAxis }) => [{
      inputsMap: source.inputs,
      resultsByInput,
      getXSi: (payload) => utciAxisAdapter.getAxisValue(payload, config.xField),
      getYSi: (payload) => utciAxisAdapter.getAxisValue(payload, config.yField),
      formatXDisplay: roundValue,
      formatYDisplay: roundValue,
      getHovertemplate: ({ inputLabel, result }) => {
        const valueSi = result?.utci;
        const bandIndex = valueSi === undefined
          ? undefined
          : findNumericBandIndexForValue(config.bands, valueSi);
        const bandLabel = bandIndex === undefined
          ? "Unclassified"
          : config.bands[bandIndex].label;
        return `${inputLabel}<br>${xAxis.label}: %{x:.2f} ${xAxis.units}<br>${yAxis.label}: %{y:.2f} ${yAxis.units}<br><b>Band: ${bandLabel}</b><br>${MODEL_LABEL}: %{customdata[0]:.${outputMeta.decimals}f}${outputUnits}<extra></extra>`;
      },
      hoverMetadata: ({ result }) => [
        result == null
          ? ""
          : convertModelOutputFromSi(output.key, result.utci, unitSystem),
      ],
    } satisfies FieldChartInputGroup<UtciRequestDto, UtciResponseDto>],
    layout: {
      title: `${MODEL_LABEL} Dynamic Chart — ${output.label}`,
      margin: UTCI_DYNAMIC_CHART_MARGIN,
      showGrid: false,
      zeroLine: false,
      legend: { orientation: "h", x: 0, y: 1.1 },
    },
    source: CalculationSource.FrontendGenerated,
  });
}

const builder = new ComfortModelBuilder<
  UtciResponseDto,
  ModelChartSourceDto<UtciRequestDto>
>(
  ComfortModel.Utci,
);

builder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setStandardIds([])
  .setModes([ChartMode.Explore])
  .setChartableOutputs([utciOutput])
  .setModifiers([])
  .setCharts({
    defaultId: ChartId.Stress,
    entries: [
      {
        id: ChartId.Stress,
        name: "UTCI",
        emptyMessage: "No psychrometric chart yet.",
        allowsAxisSelection: false,
        locksYAxis: false,
        showsZoneToggle: false,
        showsLegend: true,
      },
      {
        id: ChartId.UtciDynamic,
        name: "Dynamic",
        emptyMessage: "No dynamic chart yet.",
        allowsAxisSelection: true,
        locksYAxis: false,
        showsZoneToggle: false,
        showsLegend: true,
      },
    ],
  });

builder.addControl({
  id: InputControlId.Temperature,
  behavior: createOperativeTemperatureControlBehavior(InputControlId.Temperature, {
    minValue: TDB_LIMITS.min,
    maxValue: TDB_LIMITS.max,
  }),
});
builder.addControl({
  id: InputControlId.RadiantTemperature,
  behavior: createControlBehavior({
    controlId: InputControlId.RadiantTemperature,
    fieldKey: FieldKey.MeanRadiantTemperature,
    minValue: TR_LIMITS.min,
    maxValue: TR_LIMITS.max,
    hidden: (context) =>
      requireTemperatureMode(context.options) === TemperatureMode.Operative,
  }),
});
builder.addControl({
  id: InputControlId.WindSpeed,
  behavior: createControlBehavior({
    controlId: InputControlId.WindSpeed,
    fieldKey: FieldKey.WindSpeed,
  }),
});
builder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
  }),
});

builder.addOptionHandler(
  OptionKey.TemperatureMode,
  createTemperatureModeOptionHandler(),
);

builder.setDynamicAxisFields([...UTCI_DYNAMIC_AXIS_FIELDS]);
builder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.RelativeHumidity,
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

builder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const outputMeta = getModelOutputDisplayMeta(ModelOutputKey.Utci, unitSystem);
  return [
    buildResultSection(MODEL_LABEL, results, visibleInputIds, (result) => {
      const value = convertModelOutputFromSi(ModelOutputKey.Utci, result.utci, unitSystem);
      return {
        text: `${formatDisplayValue(value, outputMeta.decimals)} ${outputMeta.displayUnits}`,
        color: "",
      };
    }),
    buildResultSection("Stress Category", results, visibleInputIds, (result) => {
      const zone = getUtciZoneMeta(result.utci);
      return { text: zone.label, color: zone.textColor };
    }),
  ];
});

builder.setChartBuilder((chartId, chartSource, resultsByInput, context) => {
  if (!chartSource) return null;
  if (chartId === ChartId.Stress) {
    return buildUtciStressChart(chartSource, resultsByInput, context);
  }
  if (chartId === ChartId.UtciDynamic) {
    return buildUtciDynamicChart(chartSource, resultsByInput, context);
  }
  return null;
});
export const utciModelConfig = builder.build();
