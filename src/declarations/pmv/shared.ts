import type { ComfortStandard } from "../../catalog/calculationMetadata";
import { PhysicalQuantityId } from "../../catalog/quantities";
import {
  ModelId,
  type JsThermalComfortStandard,
} from "../../catalog/modelIds";
import { InputControlId } from "../../catalog/inputControls";
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
  SurfaceId as SurfaceIdType,
} from "../../catalog/surfaces";
import { bandsFromThermalZones, numericBandFromToken, type ComplianceSpec, type ModelOutput, type NumericBand } from "../../catalog/modelCapabilities";
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
import { getDerivedFromAuxiliary } from "../../engines/comfort/quantityStateRouting";
import {
  ComfortModelBuilder,
  hasExactKeys,
  isRecord,
  type FrontendChartDeclaration,
} from "../../state/modelRegistry/builder";
import { ChartType } from "../../catalog/chartTypes";
import { ZoneToken } from "../../catalog/zoneTokens";
import {
  buildPmvResultRows,
  calculatePmvModel,
  pmvNeutralZone,
  pmvZonesList,
  type PmvChartSource,
  type PmvRequest,
  type PmvResponse,
} from "./calculation";
import { createPmvDynamicFieldChartSpec, createPmvPsychrometricChartSpec } from "./charts";
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
  readonly calculate: (request: PmvRequest) => { pmv: number; ppd: number };
  readonly checkApplicability: (request: PmvRequest) => readonly string[];
  readonly getOperativeTemperature: (request: PmvRequest) => number;
}

export interface PmvModelDeclaration {
  readonly label: string;
  readonly description: string;
  readonly adapter: PmvStandardAdapter;
  readonly standardIds: readonly StandardIdType[];
  readonly surfaceCapabilities: readonly SurfaceIdType[];
  readonly exploreOutputs: readonly ModelOutput[];
  readonly modifiers: readonly InputModifier[];
  readonly psychrometricChartId: string;
  readonly dynamicChartId: string;
  readonly heatLossChartId: string;
  readonly setChartId: string;
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

const ppdExploreBands: readonly NumericBand[] = [
  numericBandFromToken(ZoneToken.Acceptable, {
    min: -Infinity,
    max: 10,
    label: "Acceptable dissatisfaction (< 10%)",
  }),
  numericBandFromToken(ZoneToken.ElevatedFail, {
    min: 10,
    max: Infinity,
    label: "Elevated dissatisfaction (≥ 10%)",
  }),
];

export const pmvExploreOutputs: readonly ModelOutput[] = [
  {
    key: PhysicalQuantityId.Pmv,
    label: "PMV",
    legendTitle: "PMV Zones",
    defaultBands: bandsFromThermalZones(pmvZonesList),
  },
  {
    key: PhysicalQuantityId.Ppd,
    label: "PPD (%)",
    legendTitle: "PPD Bands",
    defaultBands: ppdExploreBands,
  },
];

export function createPmvComplianceBands(): readonly NumericBand[] {
  return [
    numericBandFromToken(ZoneToken.FailFill, {
      min: -Infinity,
      max: pmvNeutralZone.min,
      label: "Outside acceptable PMV range",
    }),
    numericBandFromToken(ZoneToken.Acceptable, {
      min: pmvNeutralZone.min,
      max: pmvNeutralZone.max,
      label: "Acceptable PMV range",
    }),
    numericBandFromToken(ZoneToken.FailFill, {
      min: pmvNeutralZone.max,
      max: Infinity,
      label: "Outside acceptable PMV range",
    }),
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

export function createPmvCharts(
  declaration: PmvModelDeclaration,
): readonly FrontendChartDeclaration<PmvResponse, PmvChartSource>[] {
  return [
    {
      id: declaration.psychrometricChartId,
      type: ChartType.Psychrometric,
      emptyMessage: "No psychrometric chart yet.",
      spec: createPmvPsychrometricChartSpec(
        declaration,
        declaration.psychrometricChartId,
      ),
    },
    {
      id: declaration.dynamicChartId,
      type: ChartType.Dynamic,
      emptyMessage: "No dynamic chart yet.",
      supportedExploreOutputs: [PhysicalQuantityId.Pmv, PhysicalQuantityId.Ppd],
      spec: createPmvDynamicFieldChartSpec(
        declaration,
        declaration.dynamicChartId,
        PMV_DYNAMIC_AXIS_FIELDS,
      ),
    },
    {
      id: declaration.heatLossChartId,
      type: ChartType.HeatLoss,
      emptyMessage: "No heat-loss chart yet.",
      spec: createPmvHeatLossParametricSpec(),
    },
    {
      id: declaration.setChartId,
      type: ChartType.Set,
      emptyMessage: "No SET chart yet.",
      spec: createPmvSetParametricSpec(),
    },
  ];
}

export function createPmvModelConfig(declaration: PmvModelDeclaration) {
  const { adapter } = declaration;
  const builder = new ComfortModelBuilder<
    PmvResponse,
    PmvChartSource,
    NumericBand
  >(
    adapter.modelId,
  );
  const temperatureModeOptionHandler = createTemperatureModeOptionHandler({
    postSynchronize: synchronizeSelectedHumidityMode,
  });

  builder
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setStandardIds(declaration.standardIds)
    .setSurfaceCapabilities([...declaration.surfaceCapabilities])
    .setExploreOutputs(declaration.exploreOutputs)
    .setModifiers(declaration.modifiers)
    .setComplianceProfile(declaration.complianceProfile)
    .setInputFields([
      {
        kind: "operativeTemperature",
        postSynchronize: synchronizeSelectedHumidityMode,
      },
      {
        kind: "radiantTemperature",
        hideWhen: "operative",
      },
      {
        kind: "occupantAirSpeed",
        supportsOccupantAirSpeedControl: adapter.supportsOccupantAirSpeedControl,
      },
      { kind: "advancedHumidity" },
      {
        kind: "preset",
        presetKey: InputPresetKey.MetabolicRate,
        controlId: InputControlId.MetabolicRate,
        fieldKey: PhysicalQuantityId.MetabolicRate,
        applyInput: (context, inputId, nextValue) => {
          if (nextValue === null) return null;
          const nextInputState = {
            ...context.quantitiesByInput[inputId],
            [PhysicalQuantityId.MetabolicRate]: nextValue,
          };
          const synchronized = synchronizeSelectedHumidityMode(
            nextInputState,
            getDerivedFromAuxiliary(context.auxiliaryQuantitiesByInput[inputId]),
            context.options,
          );
          return createSingleInputPatch(inputId, synchronized);
        },
      },
      {
        kind: "preset",
        presetKey: InputPresetKey.ClothingInsulation,
        controlId: InputControlId.ClothingInsulation,
        fieldKey: PhysicalQuantityId.ClothingInsulation,
        presetDecimals: 2,
        showClothingBuilder: true,
        maxValue: adapter.clothingInsulationMaxSi,
      },
    ])
    .addOptionHandler(OptionKey.TemperatureMode, temperatureModeOptionHandler)
    .addOptionHandler(OptionKey.HumidityInputMode, humidityModeOptionHandler)
    .setDefaultOptions({ ...declaration.defaultOptions })
    .setOptionParser(declaration.parseOptions)
    .setDynamicAxisFields([...PMV_DYNAMIC_AXIS_FIELDS])
    .setDefaultDynamicAxes({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity })
    .setCalculator((context, visibleInputIds) => (
      calculatePmvModel(context, visibleInputIds, adapter)
    ))
    .setTables({
      results: buildPmvResultRows(),
    })
    .setCharts(
      createPmvCharts(declaration),
      { defaultChartId: declaration.psychrometricChartId },
    );

  if (adapter.supportsOccupantAirSpeedControl) {
    builder.addOptionHandler(
      OptionKey.AirSpeedControlMode,
      createAirSpeedOptionHandler(),
    );
  }

  return builder.build();
}
