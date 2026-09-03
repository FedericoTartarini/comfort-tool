import type {
  CalculationSource,
  ComfortStandard,
} from "../../catalog/calculationMetadata";
import {
  ModelId,
  ComplianceStatus,
  type JsThermalComfortStandard,
} from "../../catalog/modelIds";
import type { ModelChartSource } from "../../catalog/chartSource";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import {
  PhysicalQuantityId,
  getPhysicalQuantityMeta,
  type QuantityState,
} from "../../catalog/quantities";
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
} from "../../catalog/surfaces";
import type { LibraryInterval } from "../../catalog/classifierBins";
import type { TableRowSpec } from "../../catalog/tableTypes";
import {
  createTemperatureModeOptionHandler,
} from "../../engines/comfort/controls/temperatureControl";
import {
  defineModel,
  inputQuantity,
  resultQuantity,
  type JsModelLibrary,
} from "../../state/modelRegistry/builder";
import { ChartType } from "../../catalog/chartTypes";
import { buildHoverTemplate } from "../../engines/comfort/charts/plotlyBuilders";
import type { ChartAxisScale } from "../../engines/comfort/charts/types";
import type {
  BoundaryRegionChartEngineSpec,
  BoundaryRegionDataSpec,
} from "../../engines/comfort/charts/kinds/types";
import { convertFieldValueFromSi, plotlyHoverNumber } from "../../engines/units";
import { roundValue } from "../../engines/comfort/helpers";
import type { PlotHoverRow } from "../../engines/plotlyTypes";
import { unitLabel, type UnitSystem as UnitSystemType } from "../../catalog/units";
import {
  buildAdaptiveResultRows,
  calculateAdaptive,
  adaptiveValuesFromResponse,
  getLevelResult,
  parseAdaptiveOptions,
  toAdaptiveRequest,
  toAdaptiveRequestFromSi,
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
  exploreMode: boolean;
  intervals: readonly LibraryInterval[];
  exploreOutputs: readonly ModelOutput[];
  modifiers?: readonly InputModifier[];
  complianceProfile: ComplianceSpec<Band>;
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

export interface AdaptiveChartSource extends ModelChartSource<AdaptiveRequest> {
  extrasByInput: Partial<Record<InputIdType, AdaptiveResponse | null>>;
}

function buildAdaptiveTableRows(
  declaration: AdaptiveModelDeclaration,
): TableRowSpec[] {
  const rowMeta = [
    { id: "compliance", label: "Compliance" },
    ...declaration.levels.map((level) => ({ id: level.id, label: level.label })),
  ];
  return rowMeta.map((meta, index) => ({
    id: meta.id,
    label: meta.label,
    format: (result, unitSystem, context) => (
      buildAdaptiveResultRows(declaration, unitSystem)[index].formatter(
        result,
        unitSystem,
        context,
      )
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
  const boundaryUnits = unitLabel(
    getPhysicalQuantityMeta(PhysicalQuantityId.DryBulbTemperature).siUnit,
    unitSystem,
  );
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

export const adaptiveIndoorTemperatureRangeSi = { min: 10, max: 40 };
export const adaptivePrevailingMeanRangeSi = { min: 10, max: 33.5 };
export const adaptiveAirSpeedRangeSi = { min: 0, max: 2 };
export const adaptiveOperativeRangeSi = { min: 10, max: 40 };

export function createAdaptiveBoundaryRegionSpec(
  declaration: AdaptiveModelDeclaration,
): BoundaryRegionChartEngineSpec<QuantityState> {
  const spec: BoundaryRegionDataSpec<QuantityState, AdaptiveRequest> = {
    axisFields: [
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ],
    outdoorRangeSi: declaration.outdoorTemperatureRangeSi,
    outdoorLabel: declaration.outdoorTemperatureLabel,
    operativeRangeSi: adaptiveOperativeRangeSi,
    boundaryPoints: 240,
    evaluate: (payload) => adaptiveValuesFromResponse(
      calculateAdaptive(declaration, payload),
    ),
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
    getHoverMetadata: (_result, unitSystem, payload) => (
      getAdaptiveHoverMetadata(
        declaration,
        calculateAdaptive(declaration, payload as AdaptiveRequest),
        unitSystem,
      )
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
  return spec as unknown as BoundaryRegionChartEngineSpec<QuantityState>;
}

export function createAdaptiveModelConfig(
  declaration: AdaptiveModelDeclaration,
) {
  return defineModel(declaration.library as Parameters<typeof defineModel>[0], {
    id: declaration.modelId,
    standardIds: declaration.standardIds,
    exploreMode: declaration.exploreMode,
    inputs: [
      inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
        widget: InputWidget.OperativeTemperature,
        minValue: adaptiveIndoorTemperatureRangeSi.min,
        maxValue: adaptiveIndoorTemperatureRangeSi.max,
      }),
      inputQuantity("tr", PhysicalQuantityId.MeanRadiantTemperature, {
        widget: InputWidget.RadiantTemperature,
        hideWhen: "air",
        label: "Mean radiant temperature",
        minValue: adaptiveIndoorTemperatureRangeSi.min,
        maxValue: adaptiveIndoorTemperatureRangeSi.max,
      }),
      inputQuantity("t_running_mean", PhysicalQuantityId.PrevailingMeanOutdoorTemperature, {
        label: declaration.outdoorTemperatureLabel,
        minValue: adaptivePrevailingMeanRangeSi.min,
        maxValue: adaptivePrevailingMeanRangeSi.max,
      }),
      inputQuantity("v", PhysicalQuantityId.RelativeAirSpeed, {
        widget: InputWidget.Preset,
        presetKey: declaration.airSpeedPresetKey,
        label: "Air speed",
        minValue: adaptiveAirSpeedRangeSi.min,
        maxValue: adaptiveAirSpeedRangeSi.max,
      }),
    ],
    response: {
      values: [
        resultQuantity("t_o", PhysicalQuantityId.OperativeTemperature),
      ],
      intervals: declaration.intervals,
    },
    tables: {
      results: buildAdaptiveTableRows(declaration),
    },
    charts: [
      {
        type: ChartType.Adaptive,
        spec: createAdaptiveBoundaryRegionSpec(declaration),
      },
    ],
    features: {
      ...(declaration.modifiers ? { modifiers: declaration.modifiers } : {}),
      optionHandlers: [
        {
          key: OptionKey.TemperatureMode,
          handler: createTemperatureModeOptionHandler(),
        },
      ],
      complianceProfile: declaration.complianceProfile,
      exploreOutputs: declaration.exploreOutputs,
      defaultOptions: {
        ...defaultAdaptiveOptions,
        [OptionKey.TemperatureMode]: TemperatureMode.Operative,
      },
      parseOptions: parseAdaptiveOptions,
    },
    pipeline: {
      invoke: (si, context) => adaptiveValuesFromResponse(
        calculateAdaptive(declaration, toAdaptiveRequestFromSi(si, context)),
      ),
      mapChartInput: (_si, context, inputId) => toAdaptiveRequest(context, inputId),
      buildChartSource: (context, visibleInputIds): AdaptiveChartSource => {
        const extrasByInput: AdaptiveChartSource["extrasByInput"] = {};
        const inputs: AdaptiveChartSource["inputs"] = {};
        for (const inputId of visibleInputIds) {
          const request = toAdaptiveRequest(context, inputId);
          inputs[inputId] = request;
          extrasByInput[inputId] = calculateAdaptive(declaration, request);
        }
        return { inputs, extrasByInput };
      },
    },
    dynamicAxisFields: [
      PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      PhysicalQuantityId.OperativeTemperature,
    ],
    defaultDynamicAxes: {
      xAxis: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
      yAxis: PhysicalQuantityId.OperativeTemperature,
    },
  });
}
