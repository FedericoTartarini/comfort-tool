import { phs } from "jsthermalcomfort";
import type { ModelChartSource } from "../../catalog/chartSource";
import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../../catalog/quantities";
import { ModelId } from "../../catalog/modelIds";
import { InputControlId } from "../../catalog/inputControls";
import { InputWidget } from "../../catalog/inputWidgets";
import { bandsFromThermalZones, type ChartBuildContext, type ModelOutput, type NumericBand } from "../../catalog/modelCapabilities";
import { ThermalZone } from "../../catalog/thermalZone";
import { resolveZoneAppearance, ZoneToken } from "../../catalog/zoneTokens";
import { StandardId } from "../../catalog/surfaces";
import { ChartType } from "../../catalog/chartTypes";
import type { TableRowAuthoring, TableRowSpec } from "../../catalog/tableTypes";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PhsLimitingCriterion,
  defaultPhsPersonSettings,
  type PhsEnvironmentSi,
  type PhsResponse,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
} from "../../catalog/phs";
import {
  defineLibraryQuantityMapping,
} from "../../engines/comfort/requestMapping";
import { chartPayloadFromSpec } from "../../engines/comfort/charts/toChartPayload";
import {
  convertQuantityFromSi,
  formatDisplayValue,
} from "../../engines/units";
import { unitLabel, UnitSystem, type UnitSystem as UnitSystemType } from "../../catalog/units";
import {
  defineModel,
  inputQuantity,
  parseEmptyOptions,
  resultQuantity,
  type FrontendChartDeclaration,
  type ResultRowDefinition,
} from "../../state/modelRegistry/builder";
import {
  getPhsWaterLossLimitG,
  personFromModelInputs,
  simulatePhs,
} from "./calculation";
import {
  createPhsDynamicGridSpec,
  phsExposureHistoryChartSpec,
} from "./charts";
import { phsEnvironmentRangeSi } from "./environmentRanges";
import {
  buildPhsTemperatureTimeSeriesChart,
  buildPhsWaterLossTimeSeriesChart,
} from "./timeSeriesCharts";



function formatPhsMinute(minute: number | null): string {
  return minute === null
    ? "Not reached"
    : `${formatDisplayValue(minute / 60)} h`;
}

function phsLimitingCriterionLabel(result: PhsSimulationResult): string {
  if (result.limitingCriterion === PhsLimitingCriterion.None) {
    return "No limit reached";
  }
  return result.limitingCriterion === PhsLimitingCriterion.RectalTemperature
    ? "Rectal temperature"
    : "Water loss";
}

function buildPhsSimulationTableRows(): TableRowAuthoring<PhsSimulationResult>[] {
  return [
    {
      quantity: PhysicalQuantityId.RectalTemperature,
      id: "phs-peak-rectal-temperature",
      label: "Peak rectal temperature",
      group: "Rectal temperature",
      value: (result) => result.peakRectalTemperatureC,
    },
    {
      id: "phs-first-rectal-limit",
      label: "First 38 °C exceedance",
      group: "Rectal temperature",
      format: (result) => ({ text: formatPhsMinute(result.firstRectalLimitMinute) }),
    },
    {
      quantity: PhysicalQuantityId.SweatLoss,
      id: "phs-final-water-loss",
      label: "Final water loss",
      group: "Water loss",
      value: (result) => result.sweatLossG,
    },
    {
      id: "phs-first-water-loss-limit",
      label: "Water-loss limit",
      group: "Water loss",
      format: (result) => ({ text: formatPhsMinute(result.firstWaterLossLimitMinute) }),
    },
    {
      id: "phs-limiting-criterion",
      label: "Limiting criterion",
      format: (result) => ({
        text: phsLimitingCriterionLabel(result),
        ...(result.limitingMinute !== null
          ? { subtext: formatPhsMinute(result.limitingMinute) }
          : {}),
      }),
    },
  ];
}

const REFERENCE_WATER_LOSS_LIMIT_G = getPhsWaterLossLimitG(defaultPhsPersonSettings);

const limitingExposureZones = [
  new ThermalZone({
    label: `< ${PHS_COMPLIANCE_HORIZON_MINUTES}`,
    max: PHS_COMPLIANCE_HORIZON_MINUTES,
    token: ZoneToken.FailFill,
  }),
  new ThermalZone({
    label: `>= ${PHS_COMPLIANCE_HORIZON_MINUTES}`,
    min: PHS_COMPLIANCE_HORIZON_MINUTES,
    token: ZoneToken.PassFill,
  }),
];

/** Explore chart presets. Not a library classifier; Standard uses `d_lim_*` vs 8 h. */
const rectalTemperatureZones = [
  new ThermalZone({
    label: `< ${phs.RECTAL_TEMPERATURE_LIMIT}`,
    max: phs.RECTAL_TEMPERATURE_LIMIT,
    token: ZoneToken.PassFill,
  }),
  new ThermalZone({
    label: `>= ${phs.RECTAL_TEMPERATURE_LIMIT}`,
    min: phs.RECTAL_TEMPERATURE_LIMIT,
    token: ZoneToken.FailFill,
  }),
];

const waterLossZones = [
  new ThermalZone({
    label: `< ${phs.WATER_LOSS_FRACTION_DRINK}`,
    max: REFERENCE_WATER_LOSS_LIMIT_G,
    token: ZoneToken.PassFill,
  }),
  new ThermalZone({
    label: `>= ${phs.WATER_LOSS_FRACTION_DRINK}`,
    min: REFERENCE_WATER_LOSS_LIMIT_G,
    token: ZoneToken.FailFill,
  }),
];

export const phsExploreOutputs: readonly ModelOutput[] = [
  {
    key: PhysicalQuantityId.LimitingExposureTime,
    label: "Limiting exposure time",
    legendTitle: "8-hour exposure assessment",
    defaultBands: bandsFromThermalZones(limitingExposureZones),
  },
  {
    key: PhysicalQuantityId.RectalTemperature,
    label: "Rectal temperature after 8 h",
    legendTitle: "Rectal temperature",
    defaultBands: bandsFromThermalZones(rectalTemperatureZones),
  },
  {
    key: PhysicalQuantityId.SweatLoss,
    label: "Predicted water loss after 8 h",
    legendTitle: "Predicted water loss",
    defaultBands: bandsFromThermalZones(waterLossZones),
  },
];

export const phsQuantityMapping = defineLibraryQuantityMapping<PhsEnvironmentSi>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  v: PhysicalQuantityId.WindSpeed,
  rh: PhysicalQuantityId.RelativeHumidity,
  met: PhysicalQuantityId.MetabolicRate,
  clo: PhysicalQuantityId.ClothingInsulation,
  t_re: PhysicalQuantityId.RectalTemperature,
  sweat_loss_g: PhysicalQuantityId.SweatLoss,
});

function formatHours(minutes: number): string {
  return `${formatDisplayValue(minutes / 60)} h`;
}

function criterionLabel(result: PhsResponse): string {
  if (result.limitingCriterion === PhsLimitingCriterion.RectalTemperature) {
    return "Rectal-temperature limit";
  }
  if (result.limitingCriterion === PhsLimitingCriterion.WaterLoss) {
    return "Water-loss limit";
  }
  return "No limit reached before 8 h";
}

function invalidCell(result: PhsResponse) {
  return {
    text: "Out of range",
    subtext: result.issues[0] ?? "Outside ISO 7933:2023 applicability.",
    color: resolveZoneAppearance(ZoneToken.FailFill).text,
  };
}

function buildPhsResultRows(unitSystem: UnitSystemType): ResultRowDefinition<PhsResponse>[] {
  const temperatureMeta = getPhysicalQuantityMeta(PhysicalQuantityId.RectalTemperature);
  const waterLossMeta = getPhysicalQuantityMeta(PhysicalQuantityId.SweatLoss);
  const temperatureUnits = unitLabel(temperatureMeta.siUnit, unitSystem);
  const waterLossUnits = unitLabel(waterLossMeta.siUnit, unitSystem);
  return [
    {
      title: "Rectal-temperature exposure limit",
      group: "Maximum allowable exposure time",
      formatter: (result) => result.valid
        ? { text: formatHours(result.dLimTreMinutes) }
        : invalidCell(result),
    },
    {
      title: "Water-loss exposure limit",
      group: "Maximum allowable exposure time",
      formatter: (result) => result.valid
        ? { text: formatHours(result.dLimWaterLossMinutes) }
        : invalidCell(result),
    },
    {
      title: "Earliest limiting criterion",
      group: "Maximum allowable exposure time",
      formatter: (result) => result.valid
        ? {
            text: formatHours(result.limitingExposureTimeMinutes),
            subtext: criterionLabel(result),
          }
        : invalidCell(result),
    },
    {
      title: "Rectal temperature after 8 h",
      group: "End-of-exposure state",
      formatter: (result) => {
        if (!result.valid) return invalidCell(result);
        const displayValue = convertQuantityFromSi(
          PhysicalQuantityId.RectalTemperature,
          result.tRe,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(displayValue)} ${temperatureUnits}`,
        };
      },
    },
    {
      title: "Predicted water loss after 8 h",
      group: "End-of-exposure state",
      formatter: (result) => {
        if (!result.valid) return invalidCell(result);
        const displayValue = convertQuantityFromSi(
          PhysicalQuantityId.SweatLoss,
          result.sweatLossG,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(displayValue)} ${waterLossUnits}`,
        };
      },
    },
  ];
}

function buildPhsTableRows(): TableRowSpec<PhsResponse>[] {
  return buildPhsResultRows(UnitSystem.SI).map((row) => ({
    id: row.title.toLowerCase().replace(/\s+/g, "-"),
    label: row.title,
    ...(row.group ? { group: row.group } : {}),
    format: (result, unitSystem) => {
      const match = buildPhsResultRows(unitSystem).find(({ title }) => title === row.title);
      return match!.formatter(result);
    },
  }));
}

export const phsModelConfig = defineModel(phs, {
  id: ModelId.Phs2023,
  standardIds: [StandardId.Iso7933],
  exploreMode: true,
  inputs: [
    inputQuantity("tdb", PhysicalQuantityId.DryBulbTemperature, {
      minValue: phsEnvironmentRangeSi[PhysicalQuantityId.DryBulbTemperature].min,
      maxValue: phsEnvironmentRangeSi[PhysicalQuantityId.DryBulbTemperature].max,
    }),
    inputQuantity("tr", PhysicalQuantityId.MeanRadiantTemperature, {
      minValue: phsEnvironmentRangeSi[PhysicalQuantityId.MeanRadiantTemperature].min,
      maxValue: phsEnvironmentRangeSi[PhysicalQuantityId.MeanRadiantTemperature].max,
    }),
    inputQuantity("v", PhysicalQuantityId.WindSpeed, {
      widget: InputWidget.Numeric,
      controlId: InputControlId.AirSpeed,
      minValue: phsEnvironmentRangeSi[PhysicalQuantityId.WindSpeed].min,
      maxValue: phsEnvironmentRangeSi[PhysicalQuantityId.WindSpeed].max,
      label: "Air speed",
    }),
    inputQuantity("rh", PhysicalQuantityId.RelativeHumidity, {
      minValue: phsEnvironmentRangeSi[PhysicalQuantityId.RelativeHumidity].min,
      maxValue: phsEnvironmentRangeSi[PhysicalQuantityId.RelativeHumidity].max,
    }),
    inputQuantity("met", PhysicalQuantityId.MetabolicRate, {
      widget: InputWidget.Numeric,
      minValue: phsEnvironmentRangeSi[PhysicalQuantityId.MetabolicRate].min,
      maxValue: phsEnvironmentRangeSi[PhysicalQuantityId.MetabolicRate].max,
    }),
    inputQuantity("clo", PhysicalQuantityId.ClothingInsulation, {
      widget: InputWidget.Numeric,
      minValue: phsEnvironmentRangeSi[PhysicalQuantityId.ClothingInsulation].min,
      maxValue: phsEnvironmentRangeSi[PhysicalQuantityId.ClothingInsulation].max,
    }),
  ],
  response: {
    values: [
      resultQuantity("t_re", PhysicalQuantityId.RectalTemperature),
      resultQuantity("sweat_loss_g", PhysicalQuantityId.SweatLoss),
    ],
  },
  tables: {
    results: buildPhsTableRows(),
  },
  charts: [
    {
      type: ChartType.BodyTemperature,
      supportedExploreOutputs: [PhysicalQuantityId.RectalTemperature],
      defaultExploreOutput: PhysicalQuantityId.RectalTemperature,
      spec: phsExposureHistoryChartSpec,
    },
    {
      type: ChartType.Dynamic,
      supportedExploreOutputs: phsExploreOutputs.map(({ key }) => key),
      defaultExploreOutput: PhysicalQuantityId.LimitingExposureTime,
      spec: {
        axes: {
          x: PhysicalQuantityId.DryBulbTemperature,
          y: PhysicalQuantityId.RelativeHumidity,
        },
        axisFields: [
          PhysicalQuantityId.DryBulbTemperature,
          PhysicalQuantityId.MeanRadiantTemperature,
          PhysicalQuantityId.WindSpeed,
          PhysicalQuantityId.RelativeHumidity,
          PhysicalQuantityId.MetabolicRate,
          PhysicalQuantityId.ClothingInsulation,
        ],
        resolveGridSpec: (context) => createPhsDynamicGridSpec(
          phsExploreOutputs,
          phsQuantityMapping,
          context as ChartBuildContext<NumericBand>,
        ),
      },
    },
  ] satisfies FrontendChartDeclaration<
    PhsResponse,
    ModelChartSource<PhsEnvironmentSi>
  >[],
  features: {
    exploreOutputs: phsExploreOutputs,
    complianceProfile: {
      output: PhysicalQuantityId.LimitingExposureTime,
      bands: bandsFromThermalZones(limitingExposureZones),
      legendTitle: "8-hour exposure assessment",
      caption:
        "ISO 7933:2023 thresholds are locked. A point passes when neither the 38 °C rectal-temperature limit nor the water-loss limit is reached before 8 hours.",
      getFeedback: (result) => {
        if (!result.valid) {
          return {
            text: "Outside ISO 7933:2023 applicability.",
            passes: false,
          };
        }
        const passes = result.limitingExposureTimeMinutes
          >= PHS_COMPLIANCE_HORIZON_MINUTES;
        return {
          text: passes
            ? "No exposure limit is reached before 8 hours."
            : `${criterionLabel(result)} is reached after ${formatHours(result.limitingExposureTimeMinutes)}.`,
          passes,
        };
      },
    },
    invoke: (_si, context, inputId) => simulatePhs({
      segments: [{
        id: "analysis-exposure",
        name: "Eight-hour assessment",
        durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
        ...phsQuantityMapping.mapRequest(context, inputId),
      }],
      person: personFromModelInputs(context.effectiveQuantitiesByInput[inputId]),
      recordHistory: true,
    }),
    mapChartInput: (_si, context, inputId) =>
      phsQuantityMapping.mapRequest(context, inputId),
    timeSeries: {
      rows: buildPhsSimulationTableRows(),
      simulation: {
        charts: [
          {
            id: "phs-temperature-history",
            type: ChartType.BodyTemperature,
            title: "Body temperature",
            description:
              "Rectal temperature, optional core temperature, the 38 °C limit, and phase boundaries.",
            emptyMessage: "The temperature history will appear after calculation.",
            heightClass: "h-[390px]",
            testId: "phs-temperature-chart",
            spec: {
              build: (result, draft, unitSystem) => (
                chartPayloadFromSpec(
                  ChartType.BodyTemperature,
                  buildPhsTemperatureTimeSeriesChart(
                    result as PhsSimulationResult,
                    draft as PhsTimeSeriesDraft,
                    unitSystem,
                  ),
                )
              ),
            },
          },
          {
            id: "phs-water-loss-history",
            type: ChartType.WaterLoss,
            title: "Predicted water loss",
            description:
              "Cumulative water loss against the applicable 5% or 3% body-mass limit.",
            emptyMessage: "The water-loss history will appear after calculation.",
            heightClass: "h-[360px]",
            testId: "phs-water-loss-chart",
            spec: {
              build: (result, draft, unitSystem) => (
                chartPayloadFromSpec(
                  ChartType.WaterLoss,
                  buildPhsWaterLossTimeSeriesChart(
                    result as PhsSimulationResult,
                    draft as PhsTimeSeriesDraft,
                    unitSystem,
                  ),
                )
              ),
            },
          },
        ],
      },
    },
    defaultOptions: {},
    parseOptions: parseEmptyOptions,
  },
  dynamicAxisFields: [
    PhysicalQuantityId.DryBulbTemperature,
    PhysicalQuantityId.MeanRadiantTemperature,
    PhysicalQuantityId.WindSpeed,
    PhysicalQuantityId.RelativeHumidity,
    PhysicalQuantityId.MetabolicRate,
    PhysicalQuantityId.ClothingInsulation,
  ],
  defaultDynamicAxes: {
    xAxis: PhysicalQuantityId.DryBulbTemperature,
    yAxis: PhysicalQuantityId.RelativeHumidity,
  },
});
