import type { ComfortStandard } from "../models/calculationMetadata";
import type { ModelCharts } from "../models/chartOptions";
import {
  ComfortModel,
} from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { InputControlId } from "../models/inputControls";
import {
  AirSpeedControlMode,
  HumidityInputMode,
  OptionKey,
  TemperatureMode,
  type ModelOptionsRecord,
  type PmvAshraeModelOptions,
  type PmvIsoModelOptions,
} from "../models/inputModes";
import type { InputModifier } from "../models/inputModifiers";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ChartMode as ChartModeType,
  type ComplianceSpec,
  type ModelOutput,
  type NumericBand,
} from "../models/modelCapabilities";
import {
  createAirSpeedControlBehavior,
  createAirSpeedOptionHandler,
  createControlBehavior,
} from "../services/comfort/controls/numericControl";
import {
  createHumidityControlBehavior,
  humidityModeOptionHandler,
  synchronizeSelectedHumidityMode,
} from "../services/comfort/controls/humidityControl";
import {
  createOperativeTemperatureControlBehavior,
  createTemperatureModeOptionHandler,
  requireTemperatureMode,
} from "../services/comfort/controls/temperatureControl";
import { createSingleInputPatch } from "../services/comfort/controls/types";
import {
  clothingTypicalEnsembles,
  metabolicActivityOptions,
} from "../services/comfort/referenceValues";
import {
  ComfortModelBuilder,
  hasExactKeys,
  isRecord,
} from "../state/comfortTool/modelConfigs/builder";
import {
  buildPmvResultSections,
  calculatePmvModel,
  pmvNeutralZone,
  pmvZonesList,
  type PmvChartSourceDto,
  type PmvRequestDto,
  type PmvResponseDto,
} from "./pmvCalculation";
import { buildPmvChart } from "./pmvCharts";

const PMV_DYNAMIC_AXIS_FIELDS = [
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.OperativeTemperature,
  FieldKey.RelativeAirSpeed,
  FieldKey.RelativeHumidity,
  FieldKey.MetabolicRate,
  FieldKey.ClothingInsulation,
] as const;

export type PmvModelId = typeof ComfortModel.PmvAshrae | typeof ComfortModel.PmvIso;

export interface PmvStandardAdapter {
  readonly modelId: PmvModelId;
  readonly resultStandard: ComfortStandard;
  readonly clothingInsulationMaxSi: number;
  readonly supportsOccupantAirSpeedControl: boolean;
  readonly calculate: (request: PmvRequestDto) => { pmv: number; ppd: number };
  readonly checkApplicability: (request: PmvRequestDto) => readonly string[];
  readonly getOperativeTemperature: (request: PmvRequestDto) => number;
}

export interface PmvModelDeclaration {
  readonly label: string;
  readonly description: string;
  readonly adapter: PmvStandardAdapter;
  readonly modes: readonly ChartModeType[];
  readonly chartableOutputs: readonly ModelOutput[];
  readonly modifiers: readonly InputModifier[];
  readonly charts: ModelCharts;
  readonly complianceSpec: ComplianceSpec<NumericBand, PmvResponseDto>;
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

const ppdExploreBands: readonly NumericBand[] = [
  {
    min: -Infinity,
    max: 10,
    label: "Acceptable dissatisfaction (< 10%)",
    color: "#86efac",
  },
  {
    min: 10,
    max: Infinity,
    label: "Elevated dissatisfaction (≥ 10%)",
    color: "#fca5a5",
  },
];

export const pmvChartableOutputs: readonly ModelOutput[] = [
  {
    key: ModelOutputKey.Pmv,
    label: "PMV",
    legendTitle: "PMV Zones",
    defaultBands: bandsFromThermalZones(pmvZonesList),
  },
  {
    key: ModelOutputKey.Ppd,
    label: "PPD (%)",
    legendTitle: "PPD Bands",
    defaultBands: ppdExploreBands,
  },
];

export function createPmvComplianceBands(): readonly NumericBand[] {
  return [
    {
      min: -Infinity,
      max: pmvNeutralZone.min,
      label: "Outside acceptable PMV range",
      color: "#fecaca",
    },
    {
      min: pmvNeutralZone.min,
      max: pmvNeutralZone.max,
      label: "Acceptable PMV range",
      color: "#86efac",
    },
    {
      min: pmvNeutralZone.max,
      max: Infinity,
      label: "Outside acceptable PMV range",
      color: "#fecaca",
    },
  ];
}

function formatPmvBoundary(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`PMV compliance boundaries must be finite; received ${value}.`);
  }
  if (value < 0) return `−${Math.abs(value)}`;
  return value > 0 ? `+${value}` : "0";
}

export function createPmvComplianceCaption(
  standardLabel: string,
  bands: readonly NumericBand[],
): string {
  const neutralBand = bands.find(({ min, max }) => (
    Number.isFinite(min) && Number.isFinite(max)
  ));
  if (!neutralBand) {
    throw new Error(`${standardLabel} requires a finite Neutral compliance band.`);
  }
  return `Green shading = ${standardLabel} compliant PMV (${formatPmvBoundary(neutralBand.min)} ≤ PMV < ${formatPmvBoundary(neutralBand.max)}); red = outside the limit.`;
}

const clothingPresetOptions = clothingTypicalEnsembles.map((ensemble) => ({
  id: ensemble.id,
  label: ensemble.label,
  value: ensemble.clo,
}));
const metabolicPresetOptions = metabolicActivityOptions.map((activity) => ({
  id: activity.id,
  label: activity.label,
  value: activity.met,
}));

export function createPmvModelConfig(declaration: PmvModelDeclaration) {
  const { adapter } = declaration;
  const builder = new ComfortModelBuilder<
    PmvResponseDto,
    PmvChartSourceDto,
    NumericBand
  >(
    adapter.modelId,
  );
  const temperatureBehavior = createOperativeTemperatureControlBehavior(
    InputControlId.Temperature,
    { postSynchronize: synchronizeSelectedHumidityMode },
  );
  const humidityBehavior = createHumidityControlBehavior(InputControlId.Humidity);
  const airSpeedBehavior = createAirSpeedControlBehavior(InputControlId.AirSpeed, {
    supportsOccupantAirSpeedControl: adapter.supportsOccupantAirSpeedControl,
  });
  const temperatureModeOptionHandler = createTemperatureModeOptionHandler({
    postSynchronize: synchronizeSelectedHumidityMode,
  });

  builder
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setModes(declaration.modes)
    .setChartableOutputs(declaration.chartableOutputs)
    .setModifiers(declaration.modifiers)
    .setCharts(declaration.charts)
    .setComplianceSpec(declaration.complianceSpec)
    .addControl({
      id: InputControlId.Temperature,
      behavior: temperatureBehavior,
    })
    .addControl({
      id: InputControlId.RadiantTemperature,
      behavior: createControlBehavior({
        controlId: InputControlId.RadiantTemperature,
        fieldKey: FieldKey.MeanRadiantTemperature,
        hidden: (context) =>
          requireTemperatureMode(context.options)
            === TemperatureMode.Operative,
      }),
    })
    .addControl({ id: InputControlId.AirSpeed, behavior: airSpeedBehavior })
    .addControl({ id: InputControlId.Humidity, behavior: humidityBehavior })
    .addControl({
      id: InputControlId.MetabolicRate,
      behavior: createControlBehavior({
        controlId: InputControlId.MetabolicRate,
        fieldKey: FieldKey.MetabolicRate,
        presetOptions: metabolicPresetOptions,
        applyInput: (context, inputId, nextValue) => {
          if (nextValue === null) return null;
          const nextInputState = {
            ...context.inputsByInput[inputId],
            [FieldKey.MetabolicRate]: nextValue,
          };
          const synchronized = synchronizeSelectedHumidityMode(
            nextInputState,
            context.derivedByInput[inputId],
            context.options,
          );
          return createSingleInputPatch(inputId, synchronized);
        },
      }),
    })
    .addControl({
      id: InputControlId.ClothingInsulation,
      behavior: createControlBehavior({
        controlId: InputControlId.ClothingInsulation,
        fieldKey: FieldKey.ClothingInsulation,
        presetOptions: clothingPresetOptions,
        presetDecimals: 2,
        showClothingBuilder: true,
        maxValue: adapter.clothingInsulationMaxSi,
      }),
    })
    .addOptionHandler(OptionKey.TemperatureMode, temperatureModeOptionHandler)
    .addOptionHandler(OptionKey.HumidityInputMode, humidityModeOptionHandler)
    .setDefaultOptions({ ...declaration.defaultOptions })
    .setOptionParser(declaration.parseOptions)
    .setDynamicAxisFields([...PMV_DYNAMIC_AXIS_FIELDS])
    .setDefaultDynamicAxes({
      xAxis: FieldKey.DryBulbTemperature,
      yAxis: FieldKey.RelativeHumidity,
    })
    .setCalculator((context, visibleInputIds) => (
      calculatePmvModel(context, visibleInputIds, adapter)
    ))
    .setResultBuilder(buildPmvResultSections)
    .setChartBuilder((chartId, chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      return buildPmvChart(
        chartId,
        declaration,
        chartSource,
        resultsByInput,
        context,
      );
    });

  if (adapter.supportsOccupantAirSpeedControl) {
    builder.addOptionHandler(
      OptionKey.AirSpeedControlMode,
      createAirSpeedOptionHandler(),
    );
  }

  return builder.build();
}
