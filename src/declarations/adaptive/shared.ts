import type {
  CalculationSource,
  ComfortStandard,
} from "../../catalog/calculationMetadata";
import type { ModelChartSource } from "../../catalog/chartSource";
import {
  ModelId,
  ComplianceStatus,
  type JsThermalComfortStandard,
} from "../../catalog/modelIds";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../../catalog/quantities";
import { InputWidget } from "../../catalog/inputWidgets";
import type { InputPresetKey as InputPresetKeyType } from "../../engines/comfort/controls/inputControlPresets";
import {
  defaultAdaptiveOptions,
  OptionKey,
  TemperatureMode,
} from "../../catalog/inputModes";
import type { InputModifier } from "../../catalog/inputModifiers";
import {
  type Band,
  type ComplianceSpec,
  type ModelOutput,
} from "../../catalog/modelCapabilities";
import type { ThermalZone } from "../../catalog/thermalZone";
import type {
  StandardId as StandardIdType,
  SurfaceId as SurfaceIdType,
} from "../../catalog/surfaces";
import type { TableRowSpec } from "../../catalog/tableTypes";
import {
  createTemperatureModeOptionHandler,
} from "../../engines/comfort/controls/temperatureControl";
import {
  ComfortModelBuilder,
  type JsModelLibrary,
} from "../../state/modelRegistry/builder";
import { ChartType } from "../../catalog/chartTypes";
import { buildHoverTemplate } from "../../engines/comfort/charts/plotlyBuilders";
import type { ChartAxisScale } from "../../engines/comfort/charts/types";
import type { BoundaryRegionDataSpec } from "../../engines/comfort/charts/kinds/types";
import { convertFieldValueFromSi, plotlyHoverNumber } from "../../engines/units";
import { roundValue } from "../../engines/comfort/helpers";
import type { PlotHoverRow } from "../../engines/plotlyTypes";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import {
  buildAdaptiveResultRows,
  calculateAdaptive,
  calculateAdaptiveModel,
  getLevelResult,
  parseAdaptiveOptions,
} from "./calculation";

export interface AdaptiveRequest {
  tdb: number;
  tr: number;
  t_running_mean: number;
  v: number;
}

export interface AdaptiveOffsetSpec {
  readonly id: string;
  readonly lower: number;
  readonly upper: number;
}

export interface AdaptiveLevelDefinition {
  id: string;
  label: string;
}

export interface AdaptiveLibraryLevelBounds {
  id: string;
  lower: number;
  upper: number;
  accepted: boolean;
}

export interface AdaptiveLibraryResult {
  tCmf: number;
  operativeTemperature: number;
  levels: AdaptiveLibraryLevelBounds[];
}

export interface AdaptiveLevelResult {
  id: string;
  label: string;
  accepted: boolean;
  status: string | null;
  lower: number | null;
  upper: number | null;
}

export interface AdaptiveResponse {
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
  offsets: readonly AdaptiveOffsetSpec[];
  evaluateLibrary: (
    request: AdaptiveRequest,
    options: { limitInputs: boolean },
  ) => AdaptiveLibraryResult;
}

export interface AdaptiveModelDeclaration extends AdaptiveBoundaryDefinition {
  modelId: typeof ModelId.AdaptiveAshrae | typeof ModelId.AdaptiveEn;
  library: JsModelLibrary;
  standardIds: readonly StandardIdType[];
  surfaceCapabilities: readonly SurfaceIdType[];
  exploreOutputs: readonly ModelOutput[];
  modifiers: readonly InputModifier[];
  complianceProfile: ComplianceSpec<Band, AdaptiveResponse>;
  resultStandard: ComfortStandard;
  operativeTemperatureStandard: JsThermalComfortStandard;
  hoverLevelIds: readonly string[];
  complianceLevelId: string;
  outdoorTemperatureRangeSi: { min: number; max: number };
  outdoorTemperatureLabel: string;
  airSpeedPresetKey: InputPresetKeyType;
  colorByStatus: Readonly<Record<string, string>>;
  complianceColors: { compliant: string; nonCompliant: string };
}

function buildAdaptiveTableRows(
  declaration: AdaptiveModelDeclaration,
): TableRowSpec<AdaptiveResponse>[] {
  const rowMeta = [
    { id: "compliance", label: "Compliance" },
    ...declaration.levels.map((level) => ({ id: level.id, label: level.label })),
  ];
  return rowMeta.map((meta, index) => ({
    id: meta.id,
    label: meta.label,
    format: (result, unitSystem) => (
      buildAdaptiveResultRows(declaration, unitSystem)[index].formatter(result)
    ),
  }));
}

function convertBoundaryValue(
  value: number | null,
  unitSystem: UnitSystemType,
): number {
  return value === null
    ? Number.NaN
    : roundValue(
        convertFieldValueFromSi(PhysicalQuantityId.DryBulbTemperature, value, unitSystem),
        1,
      );
}

function getAdaptiveHoverMetadata(
  declaration: AdaptiveModelDeclaration,
  result: AdaptiveResponse,
  unitSystem: UnitSystemType,
): PlotHoverRow {
  const complianceLevel = getLevelResult(result, declaration.complianceLevelId);
  return [
    result.isApplicable && complianceLevel.accepted
      ? ComplianceStatus.Compliant
      : ComplianceStatus.NonCompliant,
    ...declaration.hoverLevelIds.flatMap((levelId) => {
      const level = getLevelResult(result, levelId);
      return [
        convertBoundaryValue(level.lower, unitSystem),
        convertBoundaryValue(level.upper, unitSystem),
      ];
    }),
  ];
}

function buildAdaptiveHoverTemplate(
  declaration: AdaptiveModelDeclaration,
  unitSystem: UnitSystemType,
  xAxis: ChartAxisScale,
  yAxis: ChartAxisScale,
  inputLabel: string | null = null,
): string {
  const boundaryUnits =
    getQuantityPresentationMeta(PhysicalQuantityId.DryBulbTemperature, unitSystem).displayUnits;
  const rows = declaration.hoverLevelIds.map((levelId, index) => {
    const level = declaration.levels.find(({ id }) => id === levelId);
    if (!level) throw new Error(`Unknown Adaptive hover level: ${levelId}`);
    const metadataIndex = 1 + index * 2;
    return `${level.label}: ${plotlyHoverNumber(`customdata[${metadataIndex}]`)} to ${plotlyHoverNumber(`customdata[${metadataIndex + 1}]`)} ${boundaryUnits}`;
  });
  return buildHoverTemplate([
    inputLabel,
    `${xAxis.label}: ${plotlyHoverNumber("x")} ${xAxis.units}`,
    `${yAxis.label}: ${plotlyHoverNumber("y")} ${yAxis.units}`,
    ...rows,
  ]);
}

export function createAdaptiveBoundaryRegionSpec(
  declaration: AdaptiveModelDeclaration,
): BoundaryRegionDataSpec<AdaptiveResponse, AdaptiveRequest> {
  return {
    axisFields: [
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ],
    outdoorRangeSi: declaration.outdoorTemperatureRangeSi,
    outdoorLabel: declaration.outdoorTemperatureLabel,
    operativeRangeSi: { min: 10, max: 40 },
    boundaryPoints: 240,
    evaluate: (payload) => calculateAdaptive(declaration, payload),
    requestFromPoint: (baseline, outdoorSi, operativeSi) => ({
      ...baseline,
      t_running_mean: outdoorSi,
      tdb: operativeSi,
      tr: operativeSi,
    }),
    getBandInputsSi: (payload) => ({
      [PhysicalQuantityId.RelativeAirSpeed]: payload.v,
      [PhysicalQuantityId.DryBulbTemperature]: payload.tdb,
      [PhysicalQuantityId.MeanRadiantTemperature]: payload.tr,
      [PhysicalQuantityId.PrevailingMeanOutdoorTemperature]: payload.t_running_mean,
    }),
    getHoverMetadata: (result, unitSystem) => (
      getAdaptiveHoverMetadata(declaration, result, unitSystem)
    ),
    buildHoverTemplate: (unitSystem, xAxis, yAxis, inputLabel) => (
      buildAdaptiveHoverTemplate(
        declaration,
        unitSystem,
        xAxis,
        yAxis,
        inputLabel ?? null,
      )
    ),
  };
}

export function createAdaptiveModelConfig(
  declaration: AdaptiveModelDeclaration,
) {
  const builder = new ComfortModelBuilder<
    AdaptiveResponse,
    ModelChartSource<AdaptiveRequest>,
    Band
  >(declaration.modelId);

  builder
    .setLibrary(declaration.library)
    .setStandardIds(declaration.standardIds)
    .setSurfaceCapabilities([...declaration.surfaceCapabilities])
    .setExploreOutputs(declaration.exploreOutputs)
    .setModifiers(declaration.modifiers)
    .setComplianceProfile(declaration.complianceProfile)
    .setInputFields([
      {
        quantity: PhysicalQuantityId.DryBulbTemperature,
        widget: InputWidget.OperativeTemperature,
      },
      {
        quantity: PhysicalQuantityId.MeanRadiantTemperature,
        widget: InputWidget.RadiantTemperature,
        hideWhen: "air",
        label: "Mean radiant temperature",
      },
      {
        quantity: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
        label: declaration.outdoorTemperatureLabel,
      },
      {
        quantity: PhysicalQuantityId.RelativeAirSpeed,
        widget: InputWidget.Preset,
        presetKey: declaration.airSpeedPresetKey,
        label: "Air speed",
      },
    ])
    .addOptionHandler(
      OptionKey.TemperatureMode,
      createTemperatureModeOptionHandler(),
    )
    .setDefaultOptions({
      ...defaultAdaptiveOptions,
      [OptionKey.TemperatureMode]: TemperatureMode.Operative,
    })
    .setOptionParser(parseAdaptiveOptions)
    .setCalculator((context, visibleInputIds) => (
      calculateAdaptiveModel(context, visibleInputIds, declaration)
    ))
    .setTables({
      results: buildAdaptiveTableRows(declaration),
    })
    .setCharts([
      {
        type: ChartType.Adaptive,
        spec: createAdaptiveBoundaryRegionSpec(declaration) as BoundaryRegionDataSpec<
          AdaptiveResponse
        >,
      },
    ]);

  return builder.build();
}
