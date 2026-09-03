import type { ComfortStandard } from "../../catalog/calculationMetadata";
import { PhysicalQuantityId } from "../../catalog/quantities";
import {
  ModelId,
  type JsThermalComfortStandard,
} from "../../catalog/modelIds";
import { InputWidget } from "../../catalog/inputWidgets";
import {
  AirSpeedControlMode,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
  type ModelOptionsRecord,
  type PmvAshraeModelOptions,
  type PmvIsoModelOptions,
} from "../../catalog/inputModes";
import type { InputModifier } from "../../catalog/inputModifiers";
import type {
  StandardId as StandardIdType,
} from "../../catalog/surfaces";
import { numericBandFromToken, type ComplianceSpec, type ModelOutput, type NumericBand } from "../../catalog/modelCapabilities";
import {
  createAirSpeedOptionHandler,
} from "../../engines/comfort/controls/numericControl";
import {
  humidityModeOptionHandler,
  synchronizeSelectedHumidityMode,
} from "../../engines/comfort/controls/humidityControl";
import {
  InputPresetKey,
} from "../../engines/comfort/controls/inputControlPresets";
import {
  createTemperatureModeOptionHandler,
} from "../../engines/comfort/controls/temperatureControl";
import { createSingleInputPatch } from "../../engines/comfort/controls/types";
import { getDerivedFromQuantities } from "../../engines/comfort/quantityStateRouting";
import {
  defineModel,
  hasExactKeys,
  inputQuantity,
  isRecord,
  resultQuantity,
  type FrontendChartDeclaration,
  type JsModelLibrary,
} from "../../state/modelRegistry/builder";
import { ChartType } from "../../catalog/chartTypes";
import { ZoneToken } from "../../catalog/zoneTokens";
import type { ThermalZone } from "../../catalog/thermalZone";
import { applyDynamicAxisCoordinates } from "../../engines/comfort/charts/dynamicAxisPayload";
import { plotlyHoverNumber } from "../../engines/units";
import type { LibraryInterval } from "../../catalog/classifierBins";
import {
  buildPmvResultRows,
  buildPmvChartSource,
  evaluatePmvSlot,
  createPmvRequestAxisAdapter,
  evaluatePmvCondition,
  evaluatePsychrometricPmv,
  ppdThresholdToAbsPmv,
  pmvAirSpeedRangeSi,
  pmvClothingInsulationMinSi,
  pmvIndoorTemperatureRangeSi,
  pmvMetabolicRateRangeSi,
  pmvQuantityMapping,
  pmvRelativeHumidityRangeSi,
  tryEvaluatePmvForChart,
  type PmvChartSource,
  type PmvRequest,
  type PmvResponse,
} from "./calculation";
import { createPmvHeatLossParametricSpec } from "./heatLossSeries";
import { createPmvSetParametricSpec } from "./setSeries";

const PMV_DYNAMIC_AXIS_FIELDS = [
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.OperativeTemperature,
  PhysicalQuantityId.RelativeAirSpeed,
  PhysicalQuantityId.RelativeHumidity,
  PhysicalQuantityId.MetabolicRate,
  PhysicalQuantityId.ClothingInsulation,
] as const;

export type PmvModelId = typeof ModelId.PmvAshrae | typeof ModelId.PmvIso;

export interface PmvStandardAdapter {
  readonly modelId: PmvModelId;
  readonly resultStandard: ComfortStandard;
  readonly clothingStandard: JsThermalComfortStandard;
  readonly clothingInsulationMaxSi: number;
  readonly supportsOccupantAirSpeedControl: boolean;
  readonly calculate: (request: PmvRequest) => {
    pmv: number;
    ppd: number;
    tsv: string | number;
    compliance?: boolean | number;
  };
  readonly checkApplicability: (request: PmvRequest) => readonly string[];
  readonly getOperativeTemperature: (request: PmvRequest) => number;
  readonly classifyTsv: (pmv: number) => string;
  readonly isAcceptablePmv: (pmv: number) => boolean;
  readonly comfortIsolineTargets: readonly [number, number];
  readonly tsvZones: readonly ThermalZone[];
}

export interface PmvModelDeclaration {
  readonly library: JsModelLibrary;
  readonly adapter: PmvStandardAdapter;
  readonly standardIds: readonly StandardIdType[];
  readonly exploreMode: boolean;
  readonly intervals: readonly LibraryInterval[];
  readonly exploreOutputs: readonly ModelOutput[];
  readonly modifiers: readonly InputModifier[];
  readonly complianceProfile: ComplianceSpec<NumericBand, PmvResponse>;
  readonly defaultOptions: PmvAshraeModelOptions | PmvIsoModelOptions;
  readonly parseOptions: (value: unknown) => ModelOptionsRecord | null;
}

const temperatureModeValues = new Set<string>(Object.values(TemperatureMode));
const humidityInputModeValues = new Set<string>(Object.values(HumidityInputMode));
const airSpeedControlModeValues = new Set<string>(Object.values(AirSpeedControlMode));
const pmvIsoOptionKeys = [
  OptionKey.TemperatureMode,
  OptionKey.HumidityInputMode,
];
const pmvAshraeOptionKeys = [
  ...pmvIsoOptionKeys,
  OptionKey.AirSpeedControlMode,
];

function parsePmvCommonOptions(
  value: Record<string, unknown>,
): PmvIsoModelOptions | null {
  const temperatureMode = value[OptionKey.TemperatureMode];
  const humidityInputMode = value[OptionKey.HumidityInputMode];
  if (
    typeof temperatureMode !== "string"
    || !temperatureModeValues.has(temperatureMode)
    || typeof humidityInputMode !== "string"
    || !humidityInputModeValues.has(humidityInputMode)
  ) {
    return null;
  }
  return {
    [OptionKey.TemperatureMode]: temperatureMode as TemperatureMode,
    [OptionKey.HumidityInputMode]: humidityInputMode as HumidityInputMode,
  };
}

export function parsePmvIsoOptions(value: unknown): PmvIsoModelOptions | null {
  if (!isRecord(value) || !hasExactKeys(value, pmvIsoOptionKeys)) return null;
  return parsePmvCommonOptions(value);
}

export function parsePmvAshraeOptions(
  value: unknown,
): PmvAshraeModelOptions | null {
  if (!isRecord(value) || !hasExactKeys(value, pmvAshraeOptionKeys)) return null;
  const commonOptions = parsePmvCommonOptions(value);
  const airSpeedControlMode = value[OptionKey.AirSpeedControlMode];
  if (
    !commonOptions
    || typeof airSpeedControlMode !== "string"
    || !airSpeedControlModeValues.has(airSpeedControlMode)
  ) {
    return null;
  }
  return {
    ...commonOptions,
    [OptionKey.AirSpeedControlMode]: airSpeedControlMode as AirSpeedControlMode,
  };
}

/** Explore-only PPD chart preset. Not a library classifier; users can edit these bands. */
const ppdExploreBands: readonly NumericBand[] = [
  numericBandFromToken(ZoneToken.Acceptable, {
    min: -Infinity,
    max: 10,
    label: "< 10",
  }),
  numericBandFromToken(ZoneToken.ElevatedFail, {
    min: 10,
    max: Infinity,
    label: ">= 10",
  }),
];

export function createPmvExploreOutputs(
  pmvDefaultBands: readonly NumericBand[],
  pmvLegendTitle: string,
): readonly ModelOutput[] {
  return [
    {
      key: PhysicalQuantityId.PredictedMeanVote,
      label: "PMV",
      legendTitle: pmvLegendTitle,
      defaultBands: pmvDefaultBands,
    },
    {
      key: PhysicalQuantityId.PredictedPercentageOfDissatisfied,
      label: "PPD (%)",
      legendTitle: "PPD Bands",
      defaultBands: ppdExploreBands,
    },
  ];
}

export function formatPmvBoundary(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`PMV compliance boundaries must be finite; received ${value}.`);
  }
  if (value < 0) return `−${Math.abs(value)}`;
  return value > 0 ? `+${value}` : "0";
}

export function createAshraePmvComplianceCaption(
  targets: readonly [number, number],
): string {
  return `Green shading = ASHRAE 55 compliant PMV (${formatPmvBoundary(targets[0])} < PMV < ${formatPmvBoundary(targets[1])}); red = outside the limit.`;
}

export const ISO_TSV_CAPTION =
  "Colours follow ISO 7730 thermal sensation vote (TSV).";

export function createPmvCharts(
  declaration: PmvModelDeclaration,
): readonly FrontendChartDeclaration<PmvResponse, PmvChartSource>[] {
  const { adapter } = declaration;
  const axisAdapter = createPmvRequestAxisAdapter(adapter);
  return [
    {
      type: ChartType.Psychrometric,
      spec: {
        evaluate: (payload, tdb, rh) => evaluatePsychrometricPmv(
          adapter,
          payload as PmvRequest,
          tdb,
          rh,
          false,
        ),
        evaluateHover: (payload, tdb, rh) => {
          const sample = tryEvaluatePmvForChart(
            adapter,
            {
              ...(payload as PmvRequest),
              tdb,
              rh,
            },
          );
          return sample
            ? { pmv: sample.pmv, ppd: sample.ppd }
            : null;
        },
        trEqualsTdb: (chartSource) => (
          Boolean(
            chartSource
            && typeof chartSource === "object"
            && "psychrometricTrEqualsTdb" in chartSource
            && (chartSource as PmvChartSource).psychrometricTrEqualsTdb,
          )
        ),
        comfortIsolineTargets: adapter.comfortIsolineTargets,
        ppdThresholdToAbsPmv,
      },
    },
    {
      type: ChartType.Dynamic,
      supportedExploreOutputs: [PhysicalQuantityId.PredictedMeanVote, PhysicalQuantityId.PredictedPercentageOfDissatisfied],
      spec: {
        axes: {
          x: PhysicalQuantityId.DryBulbTemperature,
          y: PhysicalQuantityId.RelativeHumidity,
        },
        axisFields: [...PMV_DYNAMIC_AXIS_FIELDS],
        evaluate: (payload) => {
          const evaluation = evaluatePmvCondition(adapter, payload as PmvRequest);
          return {
            pmv: evaluation.pmv,
            ppd: evaluation.ppd,
          } as PmvResponse;
        },
        getOutputValue: (result, outputKey) => {
          const quantity = outputKey ?? PhysicalQuantityId.PredictedMeanVote;
          const value = pmvQuantityMapping.fromLibrary(result)[quantity];
          if (typeof value !== "number") {
            throw new Error(`Unsupported PMV output: ${quantity}`);
          }
          return value;
        },
        requestAdapter: axisAdapter,
        chartAxisAdapter: axisAdapter,
        applyChartCoordinates: (payload, xField, xSi, yField, ySi) => (
          applyDynamicAxisCoordinates(
            payload as PmvRequest,
            { field: xField, valueSi: xSi },
            { field: yField, valueSi: ySi },
            axisAdapter,
          )
        ),
        getIsolineValue: (result) => result.pmv,
        absFromThreshold: ppdThresholdToAbsPmv,
        clipAirSpeedWithoutOccupantControl: (payload) => (
          (payload as PmvRequest).occupantHasAirSpeedControl === false
        ),
        axisRanges: {
          [PhysicalQuantityId.OperativeTemperature]: pmvIndoorTemperatureRangeSi,
        },
        dynamicHoverExtension: {
          getTemplateSuffix: (_unitSystem, zOutput) => (
            zOutput === PhysicalQuantityId.PredictedPercentageOfDissatisfied
              ? `<br>PMV: ${plotlyHoverNumber("customdata[1]")}`
              : `<br>PPD: ${plotlyHoverNumber("customdata[2]")}%`
          ),
          getMetadata: (result) => (
            result
              ? [result.pmv, result.ppd]
              : [Number.NaN, Number.NaN]
          ),
        },
        dynamicViewLayout: {
          margin: { l: 64, r: 24, t: 48, b: 64 },
        },
      },
    },
    {
      type: ChartType.HeatLoss,
      spec: createPmvHeatLossParametricSpec(),
    },
    {
      type: ChartType.Set,
      spec: createPmvSetParametricSpec(),
    },
  ];
}

export function createPmvModelConfig(declaration: PmvModelDeclaration) {
  const { adapter } = declaration;
  const temperatureModeOptionHandler = createTemperatureModeOptionHandler({
    postSynchronize: synchronizeSelectedHumidityMode,
  });
  const optionHandlers = [
    { key: OptionKey.TemperatureMode, handler: temperatureModeOptionHandler },
    { key: OptionKey.HumidityInputMode, handler: humidityModeOptionHandler },
    ...(adapter.supportsOccupantAirSpeedControl
      ? [{
          key: OptionKey.AirSpeedControlMode,
          handler: createAirSpeedOptionHandler(),
        }]
      : []),
  ];

  return defineModel(declaration.library as Parameters<typeof defineModel>[0], {
    id: adapter.modelId,
    standardIds: declaration.standardIds,
    exploreMode: declaration.exploreMode,
    inputs: [
      inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
        widget: InputWidget.OperativeTemperature,
        minValue: pmvIndoorTemperatureRangeSi.min,
        maxValue: pmvIndoorTemperatureRangeSi.max,
        postSynchronize: synchronizeSelectedHumidityMode,
      }),
      inputQuantity("tr", PhysicalQuantityId.MeanRadiantTemperature, {
        widget: InputWidget.RadiantTemperature,
        hideWhen: "operative",
        minValue: pmvIndoorTemperatureRangeSi.min,
        maxValue: pmvIndoorTemperatureRangeSi.max,
      }),
      inputQuantity("vr", PhysicalQuantityId.RelativeAirSpeed, {
        widget: InputWidget.OccupantAirSpeed,
        supportsOccupantAirSpeedControl: adapter.supportsOccupantAirSpeedControl,
        minValue: pmvAirSpeedRangeSi.min,
        maxValue: pmvAirSpeedRangeSi.max,
      }),
      inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
        widget: InputWidget.AdvancedHumidity,
        minValue: pmvRelativeHumidityRangeSi.min,
        maxValue: pmvRelativeHumidityRangeSi.max,
      }),
      inputQuantity("met", PhysicalQuantityId.MetabolicRate, {
        widget: InputWidget.Preset,
        presetKey: InputPresetKey.MetabolicRate,
        minValue: pmvMetabolicRateRangeSi.min,
        maxValue: pmvMetabolicRateRangeSi.max,
        applyInput: (context, inputId, nextValue) => {
          if (nextValue === null) return null;
          const nextInputState = {
            ...context.quantitiesByInput[inputId],
            [PhysicalQuantityId.MetabolicRate]: nextValue,
          };
          const synchronized = synchronizeSelectedHumidityMode(
            nextInputState,
            getDerivedFromQuantities(context.quantitiesByInput[inputId]),
            context.options,
          );
          return createSingleInputPatch(inputId, synchronized);
        },
      }),
      inputQuantity("clo", PhysicalQuantityId.ClothingInsulation, {
        widget: InputWidget.Preset,
        presetKey: InputPresetKey.ClothingInsulation,
        presetDecimals: 2,
        showClothingBuilder: true,
        minValue: pmvClothingInsulationMinSi,
        maxValue: adapter.clothingInsulationMaxSi,
      }),
    ],
    response: {
      values: [
        resultQuantity("pmv", PhysicalQuantityId.PredictedMeanVote),
        resultQuantity("ppd", PhysicalQuantityId.PredictedPercentageOfDissatisfied),
        resultQuantity("set", PhysicalQuantityId.StandardEffectiveTemperature),
        resultQuantity("ce", PhysicalQuantityId.CoolingEffect),
        resultQuantity("vr", PhysicalQuantityId.RelativeAirSpeed),
      ],
      intervals: declaration.intervals,
    },
    tables: {
      results: buildPmvResultRows(),
    },
    charts: createPmvCharts(declaration),
    features: {
      modifiers: declaration.modifiers,
      optionHandlers,
      complianceProfile: declaration.complianceProfile,
      exploreOutputs: declaration.exploreOutputs,
      invoke: (_si, context, inputId) => evaluatePmvSlot(adapter, context, inputId),
      buildChartSource: (context, visibleInputIds) =>
        buildPmvChartSource(adapter, context, visibleInputIds),
      defaultOptions: declaration.defaultOptions,
      parseOptions: declaration.parseOptions,
    },
  });
}
