import type {
  CalculationSource,
  ComfortStandard,
} from "../models/calculationMetadata";
import { ChartId, type ModelCharts } from "../models/chartOptions";
import type { ModelChartSourceDto } from "../models/comfortDtos";
import {
  ComfortModel,
  type JsThermalComfortStandard,
} from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { InputControlId, type PresetInputOption } from "../models/inputControls";
import {
  defaultAdaptiveOptions,
  OptionKey,
  TemperatureMode,
} from "../models/inputModes";
import type { InputModifier } from "../models/inputModifiers";
import {
  type Band,
  type ChartMode as ChartModeType,
  type ComplianceSpec,
  type ModelOutput,
} from "../models/modelCapabilities";
import type { ThermalZone } from "../models/thermalZone";
import type { StandardId as StandardIdType } from "../models/workspaces";
import {
  buildDefaultPresentation,
  createControlBehavior,
} from "../services/comfort/controls/numericControl";
import {
  createOperativeTemperatureControlBehavior,
  createTemperatureModeOptionHandler,
  requireTemperatureMode,
} from "../services/comfort/controls/temperatureControl";
import {
  buildResultSectionsFromRows,
  ComfortModelBuilder,
} from "../state/comfortTool/modelConfigs/builder";
import {
  buildAdaptiveResultRows,
  calculateAdaptiveModel,
  parseAdaptiveOptions,
} from "./adaptiveCalculation";
import { buildAdaptiveChart } from "./adaptiveCharts";

export interface AdaptiveRequestDto {
  tdb: number;
  tr: number;
  trm: number;
  v: number;
}

export interface AdaptiveLevelDefinition {
  id: string;
  label: string;
  coolOffset: number;
  warmOffset: number;
}

export interface AdaptiveLevelResult {
  id: string;
  label: string;
  accepted: boolean;
  status: string | null;
  lower: number | null;
  upper: number | null;
}

export interface AdaptiveResponseDto {
  tCmf: number;
  operativeTemperature: number;
  levels: AdaptiveLevelResult[];
  isApplicable: boolean;
  standard: ComfortStandard;
  source: CalculationSource;
}

export interface AdaptiveBoundaryDefinition {
  bandSequence: readonly ThermalZone[];
  levels: readonly AdaptiveLevelDefinition[];
  coefficients: { slope: number; intercept: number };
}

export interface AdaptiveModelDeclaration extends AdaptiveBoundaryDefinition {
  modelId: typeof ComfortModel.AdaptiveAshrae | typeof ComfortModel.AdaptiveEn;
  label: string;
  description: string;
  standardIds: readonly StandardIdType[];
  modes: readonly ChartModeType[];
  chartableOutputs: readonly ModelOutput[];
  modifiers: readonly InputModifier[];
  charts: ModelCharts;
  complianceSpec: ComplianceSpec<Band, AdaptiveResponseDto>;
  resultStandard: ComfortStandard;
  operativeTemperatureStandard: JsThermalComfortStandard;
  hoverLevelIds: readonly string[];
  complianceLevelId: string;
  outdoorTemperatureRangeSi: { min: number; max: number };
  outdoorTemperatureLabel: string;
  airSpeedPresets: readonly PresetInputOption[];
  colorByStatus: Readonly<Record<string, string>>;
  complianceColors: { compliant: string; nonCompliant: string };
  evaluateApplicability: (request: AdaptiveRequestDto) => number;
}

export function createAdaptiveModelConfig(
  declaration: AdaptiveModelDeclaration,
) {
  const builder = new ComfortModelBuilder<
    AdaptiveResponseDto,
    ModelChartSourceDto<AdaptiveRequestDto>,
    Band
  >(declaration.modelId);
  const temperatureBehavior = createOperativeTemperatureControlBehavior(
    InputControlId.Temperature,
  );
  const airSpeedBehavior = createControlBehavior({
    controlId: InputControlId.AirSpeed,
    fieldKey: FieldKey.RelativeAirSpeed,
    presetOptions: [...declaration.airSpeedPresets],
    getPresentation: (context, meta) => ({
      ...buildDefaultPresentation(context, meta),
      label: "Air speed",
    }),
  });

  builder
    .setLabel(declaration.label)
    .setDescription(declaration.description)
    .setStandardIds(declaration.standardIds)
    .setModes(declaration.modes)
    .setChartableOutputs(declaration.chartableOutputs)
    .setModifiers(declaration.modifiers)
    .setCharts(declaration.charts)
    .setComplianceSpec(declaration.complianceSpec)
    .addControl({ id: InputControlId.Temperature, behavior: temperatureBehavior })
    .addControl({
      id: InputControlId.RadiantTemperature,
      behavior: createControlBehavior({
        controlId: InputControlId.RadiantTemperature,
        fieldKey: FieldKey.MeanRadiantTemperature,
        hidden: (context) =>
          requireTemperatureMode(context.options) !== TemperatureMode.Air,
        getPresentation: (context, meta) => ({
          ...buildDefaultPresentation(context, meta),
          label: "Mean radiant temperature",
        }),
      }),
    })
    .addControl({
      id: InputControlId.PrevailingMeanOutdoorTemperature,
      behavior: createControlBehavior({
        controlId: InputControlId.PrevailingMeanOutdoorTemperature,
        fieldKey: FieldKey.PrevailingMeanOutdoorTemperature,
        getPresentation: (context, meta) => ({
          ...buildDefaultPresentation(context, meta),
          label: declaration.outdoorTemperatureLabel,
        }),
      }),
    })
    .addControl({ id: InputControlId.AirSpeed, behavior: airSpeedBehavior })
    .addOptionHandler(
      OptionKey.TemperatureMode,
      createTemperatureModeOptionHandler(),
    )
    .setDefaultOptions({
      ...defaultAdaptiveOptions,
      [OptionKey.TemperatureMode]: TemperatureMode.Operative,
    })
    .setOptionParser(parseAdaptiveOptions)
    .setDynamicAxisFields([
      FieldKey.PrevailingMeanOutdoorTemperature,
      FieldKey.OperativeTemperature,
    ])
    .setDefaultDynamicAxes({
      xAxis: FieldKey.PrevailingMeanOutdoorTemperature,
      yAxis: FieldKey.OperativeTemperature,
    })
    .setCalculator((context, visibleInputIds) => (
      calculateAdaptiveModel(context, visibleInputIds, declaration)
    ))
    .setResultBuilder((results, visibleInputIds, unitSystem) =>
      buildResultSectionsFromRows(
        buildAdaptiveResultRows(declaration, unitSystem),
        results,
        visibleInputIds,
      ))
    .setChartBuilder((chartId, chartSource, resultsByInput, context) => {
      if (!chartSource) return null;
      if (chartId === ChartId.Adaptive) {
        return buildAdaptiveChart(
          declaration,
          chartSource,
          resultsByInput,
          context,
        );
      }
      return null;
    });

  return builder.build();
}
