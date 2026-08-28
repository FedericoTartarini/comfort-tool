import type { ModelChartSource } from "../../catalog/chartSource";
import { PhysicalQuantityId } from "../../catalog/quantities";
import { ModelId } from "../../catalog/modelIds";
import { InputControlId } from "../../catalog/inputControls";
import { bandsFromThermalZones, type ChartBuildContext, type ModelOutput, type NumericBand } from "../../catalog/modelCapabilities";
import { ThermalZone } from "../../catalog/thermalZone";
import { resolveZoneAppearance, ZoneToken } from "../../catalog/zoneTokens";
import { StandardId, SurfaceId } from "../../catalog/surfaces";
import { ChartType } from "../../catalog/chartTypes";
import type { TableRowAuthoring, TableRowSpec } from "../../catalog/tableTypes";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  PhsLimitingCriterion,
  defaultPhsPersonSettings,
  phsPersonQuantityIds,
  type PhsEnvironmentSi,
  type PhsResponse,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
} from "../../catalog/phs";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../../engines/comfort/requestMapping";
import {
  convertQuantityFromSi,
  formatDisplayValue,
  getQuantityDisplayMeta,
} from "../../engines/units";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../catalog/units";
import {
  ComfortModelBuilder,
  parseEmptyOptions,
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
import { chartPayloadFromSpec } from "../../engines/comfort/charts/toChartPayload";
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
      quantity: PhysicalQuantityId.PhsRectalTemperature,
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
      quantity: PhysicalQuantityId.PhsWaterLoss,
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

const MODEL_LABEL = "PHS (ISO 7933:2023)";
const MODEL_DESCRIPTION =
  "Predicts heat strain, internal temperature, sweat loss, and allowable exposure time for hot environments.";
const REFERENCE_WATER_LOSS_LIMIT_G = getPhsWaterLossLimitG(defaultPhsPersonSettings);

const limitingExposureZones = [
  new ThermalZone({
    label: "Limit reached before 8 h",
    max: PHS_COMPLIANCE_HORIZON_MINUTES,
    token: ZoneToken.FailFill,
  }),
  new ThermalZone({
    label: "No limit reached before 8 h",
    min: PHS_COMPLIANCE_HORIZON_MINUTES,
    token: ZoneToken.PassFill,
  }),
];

const rectalTemperatureZones = [
  new ThermalZone({
    label: "Below 38 °C",
    max: PHS_RECTAL_TEMPERATURE_LIMIT_C,
    token: ZoneToken.PassFill,
  }),
  new ThermalZone({
    label: "At or above 38 °C",
    min: PHS_RECTAL_TEMPERATURE_LIMIT_C,
    token: ZoneToken.FailFill,
  }),
];

const waterLossZones = [
  new ThermalZone({
    label: "Below 5% body mass",
    max: REFERENCE_WATER_LOSS_LIMIT_G,
    token: ZoneToken.PassFill,
  }),
  new ThermalZone({
    label: "At or above 5% body mass",
    min: REFERENCE_WATER_LOSS_LIMIT_G,
    token: ZoneToken.FailFill,
  }),
];

export const phsExploreOutputs: readonly ModelOutput[] = [
  {
    key: PhysicalQuantityId.PhsLimitingExposureTime,
    label: "Limiting exposure time",
    legendTitle: "8-hour exposure assessment",
    defaultBands: bandsFromThermalZones(limitingExposureZones),
  },
  {
    key: PhysicalQuantityId.PhsRectalTemperature,
    label: "Rectal temperature after 8 h",
    legendTitle: "Rectal temperature",
    defaultBands: bandsFromThermalZones(rectalTemperatureZones),
  },
  {
    key: PhysicalQuantityId.PhsWaterLoss,
    label: "Predicted water loss after 8 h",
    legendTitle: "Predicted water loss",
    defaultBands: bandsFromThermalZones(waterLossZones),
  },
];

export const phsRequestAdapter = createFieldRequestAdapter<PhsEnvironmentSi>({ tdb: PhysicalQuantityId.DryBulbTemperature, tr: PhysicalQuantityId.MeanRadiantTemperature, v: PhysicalQuantityId.WindSpeed, rh: PhysicalQuantityId.RelativeHumidity, met: PhysicalQuantityId.MetabolicRate, clo: PhysicalQuantityId.ClothingInsulation });

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
  const temperatureMeta = getQuantityDisplayMeta(
    PhysicalQuantityId.PhsRectalTemperature,
    unitSystem,
  );
  const waterLossMeta = getQuantityDisplayMeta(
    PhysicalQuantityId.PhsWaterLoss,
    unitSystem,
  );
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
          PhysicalQuantityId.PhsRectalTemperature,
          result.tRe,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(displayValue)} ${temperatureMeta.displayUnits}`,
        };
      },
    },
    {
      title: "Predicted water loss after 8 h",
      group: "End-of-exposure state",
      formatter: (result) => {
        if (!result.valid) return invalidCell(result);
        const displayValue = convertQuantityFromSi(
          PhysicalQuantityId.PhsWaterLoss,
          result.sweatLossG,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(displayValue)} ${waterLossMeta.displayUnits}`,
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

const builder = new ComfortModelBuilder<
  PhsResponse,
  ModelChartSource<PhsEnvironmentSi>
>(ModelId.Phs2023);

builder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setStandardIds([StandardId.Iso7933])
  .setSurfaceCapabilities([
    SurfaceId.Standard,
    SurfaceId.Explore,
    SurfaceId.TimeSeries,
  ])
  .setExploreOutputs(phsExploreOutputs)
  .setComplianceProfile({
    output: PhysicalQuantityId.PhsLimitingExposureTime,
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
  })
  .setModifiers([])
  .setCharts([
    {
      id: "phs-exposure-history",
      type: ChartType.BodyTemperature,
      emptyMessage: "No PHS exposure history yet.",
      supportedExploreOutputs: [PhysicalQuantityId.PhsRectalTemperature],
      defaultExploreOutput: PhysicalQuantityId.PhsRectalTemperature,
      spec: phsExposureHistoryChartSpec,
    },
    {
      id: "phs-dynamic-field",
      type: ChartType.Dynamic,
      emptyMessage: "No PHS field chart yet.",
      supportedExploreOutputs: phsExploreOutputs.map(({ key }) => key),
      defaultExploreOutput: PhysicalQuantityId.PhsLimitingExposureTime,
      spec: { title: "PHS Dynamic Chart", axisFields: [
          PhysicalQuantityId.DryBulbTemperature, PhysicalQuantityId.MeanRadiantTemperature, PhysicalQuantityId.WindSpeed, PhysicalQuantityId.RelativeHumidity, PhysicalQuantityId.MetabolicRate, PhysicalQuantityId.ClothingInsulation, ], resolveGridSpec: (context) => createPhsDynamicGridSpec(
          phsExploreOutputs, phsRequestAdapter, context as ChartBuildContext<NumericBand>, ) },
    },
  ] satisfies FrontendChartDeclaration<
    PhsResponse,
    ModelChartSource<PhsEnvironmentSi>
  >[], {
    defaultChartId: "phs-exposure-history",
  });

builder.setExtraQuantities(phsPersonQuantityIds);
builder.setInputFields([
  {
    kind: "numeric",
    controlId: InputControlId.Temperature,
    fieldKey: PhysicalQuantityId.DryBulbTemperature,
    minValue: 15,
    maxValue: 50,
  },
  {
    kind: "numeric",
    controlId: InputControlId.RadiantTemperature,
    fieldKey: PhysicalQuantityId.MeanRadiantTemperature,
    minValue: 0,
    maxValue: 60,
  },
  {
    kind: "numeric",
    controlId: InputControlId.AirSpeed,
    fieldKey: PhysicalQuantityId.WindSpeed,
    minValue: 0,
    maxValue: 3,
    label: "Air speed",
  },
  {
    kind: "numeric",
    controlId: InputControlId.Humidity,
    fieldKey: PhysicalQuantityId.RelativeHumidity,
    minValue: 0,
    maxValue: 100,
  },
  {
    kind: "numeric",
    controlId: InputControlId.MetabolicRate,
    fieldKey: PhysicalQuantityId.MetabolicRate,
    minValue: 0.9,
    maxValue: 3.9,
  },
  {
    kind: "numeric",
    controlId: InputControlId.ClothingInsulation,
    fieldKey: PhysicalQuantityId.ClothingInsulation,
    minValue: 0.1,
    maxValue: 1,
  },
]);

builder.setCalculator((context, visibleInputIds) =>
  calculatePerInput({
    context,
    visibleInputIds,
    mapRequest: phsRequestAdapter.mapRequest,
    calculate: (request) => simulatePhs({
      segments: [{
        id: "analysis-exposure",
        name: "Eight-hour assessment",
        durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
        ...request,
      }],
      person: personFromModelInputs(context.modelInputs),
      recordHistory: true,
    }),
  }));

builder.setTables({
  results: buildPhsTableRows(),
  timeSeries: buildPhsSimulationTableRows(),
});

builder.setDynamicAxisFields([
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
  PhysicalQuantityId.MetabolicRate,
  PhysicalQuantityId.ClothingInsulation,
]);
builder.setDefaultDynamicAxes({ xAxis: PhysicalQuantityId.DryBulbTemperature, yAxis: PhysicalQuantityId.RelativeHumidity });
builder.setSimulation({
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
});
builder.setDefaultOptions({});
builder.setOptionParser(parseEmptyOptions);

export const phsModelConfig = builder.build();
