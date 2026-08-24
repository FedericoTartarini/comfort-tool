import type { ModelChartSourceDto } from "../../models/comfortDtos";
import { ComfortModel } from "../../models/comfortModels";
import { PhysicalQuantityId } from "../../models/physicalQuantities";
import { InputId } from "../../models/inputSlots";
import { InputControlId } from "../../models/inputControls";
import {
  bandsFromThermalZones,
  ModelOutputKey,
  type ChartBuildContext,
  type ModelOutput,
  type NumericBand,
} from "../../models/modelCapabilities";
import { ThermalZone } from "../../models/thermalZone";
import { StandardId } from "../../models/workspaces";
import { ChartKind } from "../../models/output/chartKinds";
import { WorkspaceCapability } from "../../models/output/workspaceCapabilities";
import { TableLayout, type TableRowSpec } from "../../models/output/tableLayouts";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  PhsLimitingCriterion,
  type PhsEnvironmentSi,
  type PhsResponseDto,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
} from "../../models/phs";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../../services/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../../services/units";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../models/units";
import {
  ComfortModelBuilder,
  parseEmptyOptions,
  type OutputChartDeclarationInput,
  type ResultRowDefinition,
} from "../../state/comfortTool/modelConfigs/builder";
import {
  getPhsWaterLossLimitG,
  personFromModelInputs,
  simulatePhs,
} from "./phsCalculation";
import {
  buildPhsExposureHistoryChartResult,
  createPhsDynamicGridSpec,
} from "./phsCharts";
import {
  buildPhsTemperatureTimeSeriesChart,
  buildPhsWaterLossTimeSeriesChart,
} from "./phsTimeSeriesCharts";



function formatPhsMinute(minute: number | null): string {
  return minute === null ? "Not reached" : `${(minute / 60).toFixed(2)} h`;
}

function phsLimitingCriterionLabel(result: PhsSimulationResult): string {
  if (result.limitingCriterion === PhsLimitingCriterion.None) {
    return "No limit reached";
  }
  return result.limitingCriterion === PhsLimitingCriterion.RectalTemperature
    ? "Rectal temperature"
    : "Water loss";
}

function buildPhsSimulationTableRows(): TableRowSpec<PhsSimulationResult>[] {
  return [
    {
      id: "phs-peak-rectal-temperature",
      label: "Peak rectal temperature",
      group: "Rectal temperature",
      format: (result, unitSystem) => {
        const meta = getModelOutputDisplayMeta(
          ModelOutputKey.PhsRectalTemperature,
          unitSystem,
        );
        const value = convertModelOutputFromSi(
          ModelOutputKey.PhsRectalTemperature,
          result.peakRectalTemperatureC,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(value, meta.decimals)} ${meta.displayUnits}`,
        };
      },
    },
    {
      id: "phs-first-rectal-limit",
      label: "First 38 °C exceedance",
      group: "Rectal temperature",
      format: (result) => ({ text: formatPhsMinute(result.firstRectalLimitMinute) }),
    },
    {
      id: "phs-final-water-loss",
      label: "Final water loss",
      group: "Water loss",
      format: (result, unitSystem) => {
        const meta = getModelOutputDisplayMeta(ModelOutputKey.PhsWaterLoss, unitSystem);
        const value = convertModelOutputFromSi(
          ModelOutputKey.PhsWaterLoss,
          result.sweatLossG,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(value, meta.decimals)} ${meta.displayUnits}`,
        };
      },
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
const REFERENCE_WATER_LOSS_LIMIT_G = getPhsWaterLossLimitG(personFromModelInputs({}));

const limitingExposureZones = [
  new ThermalZone({
    label: "Limit reached before 8 h",
    max: PHS_COMPLIANCE_HORIZON_MINUTES,
    color: "#fecaca",
    textColor: "#b91c1c",
  }),
  new ThermalZone({
    label: "No limit reached before 8 h",
    min: PHS_COMPLIANCE_HORIZON_MINUTES,
    color: "#bbf7d0",
    textColor: "#047857",
  }),
];

const rectalTemperatureZones = [
  new ThermalZone({
    label: "Below 38 °C",
    max: PHS_RECTAL_TEMPERATURE_LIMIT_C,
    color: "#bbf7d0",
    textColor: "#047857",
  }),
  new ThermalZone({
    label: "At or above 38 °C",
    min: PHS_RECTAL_TEMPERATURE_LIMIT_C,
    color: "#fecaca",
    textColor: "#b91c1c",
  }),
];

const waterLossZones = [
  new ThermalZone({
    label: "Below 5% body mass",
    max: REFERENCE_WATER_LOSS_LIMIT_G,
    color: "#bbf7d0",
    textColor: "#047857",
  }),
  new ThermalZone({
    label: "At or above 5% body mass",
    min: REFERENCE_WATER_LOSS_LIMIT_G,
    color: "#fecaca",
    textColor: "#b91c1c",
  }),
];

export const phsExploreOutputs: readonly ModelOutput[] = [
  {
    key: ModelOutputKey.PhsLimitingExposureTime,
    label: "Limiting exposure time",
    legendTitle: "8-hour exposure assessment",
    defaultBands: bandsFromThermalZones(limitingExposureZones),
  },
  {
    key: ModelOutputKey.PhsRectalTemperature,
    label: "Rectal temperature after 8 h",
    legendTitle: "Rectal temperature",
    defaultBands: bandsFromThermalZones(rectalTemperatureZones),
  },
  {
    key: ModelOutputKey.PhsWaterLoss,
    label: "Predicted water loss after 8 h",
    legendTitle: "Predicted water loss",
    defaultBands: bandsFromThermalZones(waterLossZones),
  },
];

export const phsRequestAdapter = createFieldRequestAdapter<PhsEnvironmentSi>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  v: PhysicalQuantityId.WindSpeed,
  rh: PhysicalQuantityId.RelativeHumidity,
  met: PhysicalQuantityId.MetabolicRate,
  clo: PhysicalQuantityId.ClothingInsulation,
});

function formatHours(minutes: number): string {
  return `${formatDisplayValue(minutes / 60, 2)} h`;
}

function criterionLabel(result: PhsResponseDto): string {
  if (result.limitingCriterion === PhsLimitingCriterion.RectalTemperature) {
    return "Rectal-temperature limit";
  }
  if (result.limitingCriterion === PhsLimitingCriterion.WaterLoss) {
    return "Water-loss limit";
  }
  return "No limit reached before 8 h";
}

function invalidCell(result: PhsResponseDto) {
  return {
    text: "Out of range",
    subtext: result.issues[0] ?? "Outside ISO 7933:2023 applicability.",
    color: "#b91c1c",
  };
}

function buildPhsResultRows(unitSystem: UnitSystemType): ResultRowDefinition<PhsResponseDto>[] {
  const temperatureMeta = getModelOutputDisplayMeta(
    ModelOutputKey.PhsRectalTemperature,
    unitSystem,
  );
  const waterLossMeta = getModelOutputDisplayMeta(
    ModelOutputKey.PhsWaterLoss,
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
        const displayValue = convertModelOutputFromSi(
          ModelOutputKey.PhsRectalTemperature,
          result.tRe,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(displayValue, temperatureMeta.decimals)} ${temperatureMeta.displayUnits}`,
        };
      },
    },
    {
      title: "Predicted water loss after 8 h",
      group: "End-of-exposure state",
      formatter: (result) => {
        if (!result.valid) return invalidCell(result);
        const displayValue = convertModelOutputFromSi(
          ModelOutputKey.PhsWaterLoss,
          result.sweatLossG,
          unitSystem,
        );
        return {
          text: `${formatDisplayValue(displayValue, waterLossMeta.decimals)} ${waterLossMeta.displayUnits}`,
        };
      },
    },
  ];
}

function buildPhsTableRows(): TableRowSpec<PhsResponseDto>[] {
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
  PhsResponseDto,
  ModelChartSourceDto<PhsEnvironmentSi>
>(ComfortModel.Phs2023);

builder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setStandardIds([StandardId.Iso7933])
  .setWorkspaceCapabilities([
    WorkspaceCapability.Standard,
    WorkspaceCapability.Explore,
  ])
  .setExploreOutputs(phsExploreOutputs)
  .setComplianceProfile({
    output: ModelOutputKey.PhsLimitingExposureTime,
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
  .setOutputCharts([
    {
      instanceId: "phs-exposure-history",
      kind: ChartKind.Custom,
      name: "Exposure history",
      emptyMessage: "No PHS exposure history yet.",
      capabilities: {
        allowsAxisSelection: false,
        locksYAxis: false,
        allowsOutputSelection: true,
        allowsBandEditing: false,
        allowsBaselineSelection: true,
        showsZoneToggle: false,
        showsLegend: false,
        showsExport: true,
      },
      supportedExploreOutputs: [ModelOutputKey.PhsRectalTemperature],
      defaultExploreOutput: ModelOutputKey.PhsRectalTemperature,
      spec: {
        build: (
          _chartSource: import("../../models/comfortDtos").ModelChartSourceDto<PhsEnvironmentSi> | null,
          resultsByInput: Partial<Record<InputId, PhsResponseDto | null>>,
          context: ChartBuildContext<NumericBand>,
        ) => (
          buildPhsExposureHistoryChartResult(
            resultsByInput,
            context,
          )
        ),
      },
    },
    {
      instanceId: "phs-dynamic-field",
      kind: ChartKind.DynamicField,
      name: "Dynamic",
      emptyMessage: "No PHS field chart yet.",
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
      supportedExploreOutputs: phsExploreOutputs.map(({ key }) => key),
      defaultExploreOutput: ModelOutputKey.PhsLimitingExposureTime,
      spec: {
        title: "PHS Dynamic Chart",
        axisFields: [
          PhysicalQuantityId.DryBulbTemperature,
          PhysicalQuantityId.MeanRadiantTemperature,
          PhysicalQuantityId.WindSpeed,
          PhysicalQuantityId.RelativeHumidity,
          PhysicalQuantityId.MetabolicRate,
          PhysicalQuantityId.ClothingInsulation,
        ],
        resolveGridSpec: (context: ChartBuildContext<NumericBand>) => createPhsDynamicGridSpec(
          phsExploreOutputs,
          phsRequestAdapter,
          context,
        ),
      },
    },
  ] satisfies OutputChartDeclarationInput[], {
    defaultInstanceId: "phs-exposure-history",
  });

builder.registerModelQuantities([
  PhysicalQuantityId.PhsBodyWeight,
  PhysicalQuantityId.PhsHeight,
]);
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

builder.setOutputTable({
  layout: TableLayout.CompareMatrix,
  rows: buildPhsTableRows(),
});

builder.setDynamicAxisFields([
  PhysicalQuantityId.DryBulbTemperature,
  PhysicalQuantityId.MeanRadiantTemperature,
  PhysicalQuantityId.WindSpeed,
  PhysicalQuantityId.RelativeHumidity,
  PhysicalQuantityId.MetabolicRate,
  PhysicalQuantityId.ClothingInsulation,
]);
builder.setDefaultDynamicAxes({
  xAxis: PhysicalQuantityId.DryBulbTemperature,
  yAxis: PhysicalQuantityId.RelativeHumidity,
});
builder.setSimulation({
  table: {
    layout: TableLayout.MetricSummary,
    rows: buildPhsSimulationTableRows(),
  },
  charts: [
    {
      id: "phs-temperature-history",
      kind: ChartKind.TimeSeriesLine,
      title: "Body temperature",
      description:
        "Rectal temperature, optional core temperature, the 38 °C limit, and phase boundaries.",
      emptyMessage: "The temperature history will appear after calculation.",
      heightClass: "h-[390px]",
      testId: "phs-temperature-chart",
      spec: {
        build: (result, draft, unitSystem) => (
          buildPhsTemperatureTimeSeriesChart(
            result as PhsSimulationResult,
            draft as PhsTimeSeriesDraft,
            unitSystem,
          )
        ),
      },
    },
    {
      id: "phs-water-loss-history",
      kind: ChartKind.TimeSeriesLine,
      title: "Predicted water loss",
      description:
        "Cumulative water loss against the applicable 5% or 3% body-mass limit.",
      emptyMessage: "The water-loss history will appear after calculation.",
      heightClass: "h-[360px]",
      testId: "phs-water-loss-chart",
      spec: {
        build: (result, draft, unitSystem) => (
          buildPhsWaterLossTimeSeriesChart(
            result as PhsSimulationResult,
            draft as PhsTimeSeriesDraft,
            unitSystem,
          )
        ),
      },
    },
  ],
});
builder.setDefaultOptions({});
builder.setOptionParser(parseEmptyOptions);

export const phsModelConfig = builder.build();
