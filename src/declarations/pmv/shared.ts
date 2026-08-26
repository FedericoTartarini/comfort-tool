import type { ComfortStandard } from "../../catalog/calculationMetadata";
import {
  ModelId,
  type JsThermalComfortStandard,
} from "../../catalog/modelIds";
import { PhysicalQuantityId } from "../../catalog/quantities";
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
  WorkspaceId as WorkspaceIdType,
} from "../../catalog/workspaces";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  numericBandFromToken,
  type ComplianceSpec,
  type ModelOutput,
  type NumericBand,
} from "../../catalog/modelCapabilities";
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
  type ChartDeclarationInput,
} from "../../state/analysis/modelConfigs/builder";
import { ChartEngine } from "../../catalog/chartEngines";
import { TableType } from "../../catalog/tableTypes";
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
  readonly workspaceCapabilities: readonly WorkspaceIdType[];
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

const PMV_PARAMETRIC_CHART_CAPABILITIES = {
  allowsAxisSelection: false,
  locksYAxis: false,
  allowsOutputSelection: false,
  allowsBandEditing: false,
  allowsBaselineSelection: true,
  showsZoneToggle: false,
  showsLegend: false,
  showsExport: true,
} as const;

export function createPmvCharts(
  declaration: PmvModelDeclaration,
): readonly ChartDeclarationInput<PmvResponse, PmvChartSource>[] {
  return [
    {
      id: declaration.psychrometricChartId,
      engine: ChartEngine.Custom,
      name: "Psychrometric",
      emptyMessage: "No psychrometric chart yet.",
      capabilities: {
        allowsAxisSelection: false,
        locksYAxis: false,
        allowsOutputSelection: false,
        allowsBandEditing: false,
        allowsBaselineSelection: true,
        showsZoneToggle: true,
        showsLegend: true,
        showsExport: true,
      },
      spec: createPmvPsychrometricChartSpec(
        declaration,
        declaration.psychrometricChartId,
      ),
    },
    {
      id: declaration.dynamicChartId,
      engine: ChartEngine.DynamicField,
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
      supportedExploreOutputs: [ModelOutputKey.Pmv, ModelOutputKey.Ppd],
      spec: createPmvDynamicFieldChartSpec(
        declaration,
        declaration.dynamicChartId,
        PMV_DYNAMIC_AXIS_FIELDS,
      ),
    },
    {
      id: declaration.heatLossChartId,
      engine: ChartEngine.ParametricLine,
      name: "Heat Loss",
      emptyMessage: "No heat-loss chart yet.",
      capabilities: PMV_PARAMETRIC_CHART_CAPABILITIES,
      spec: createPmvHeatLossParametricSpec(),
    },
    {
      id: declaration.setChartId,
      engine: ChartEngine.ParametricLine,
      name: "SET",
      emptyMessage: "No SET chart yet.",
      capabilities: PMV_PARAMETRIC_CHART_CAPABILITIES,
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
    .setWorkspaceCapabilities([...declaration.workspaceCapabilities])
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
    .setDefaultDynamicAxes({
      xAxis: PhysicalQuantityId.DryBulbTemperature,
      yAxis: PhysicalQuantityId.RelativeHumidity,
    })
    .setCalculator((context, visibleInputIds) => (
      calculatePmvModel(context, visibleInputIds, adapter)
    ))
    .setTables({
      analysis: {
        type: TableType.Analysis,
        rows: buildPmvResultRows(),
      },
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
