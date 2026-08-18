import { ChartId } from "../models/chartOptions";
import type { ModelChartSourceDto } from "../models/comfortDtos";
import { ComfortModel } from "../models/comfortModels";
import { FieldKey } from "../models/fieldKeys";
import { InputControlId } from "../models/inputControls";
import {
  bandsFromThermalZones,
  ChartMode,
  ModelOutputKey,
  type ModelOutput,
} from "../models/modelCapabilities";
import { ThermalZone } from "../models/thermalZone";
import { StandardId } from "../models/workspaces";
import {
  PHS_COMPLIANCE_HORIZON_MINUTES,
  PHS_RECTAL_TEMPERATURE_LIMIT_C,
  PhsLimitingCriterion,
  phsReferencePerson,
  type PhsEnvironmentSi,
  type PhsResponseDto,
} from "../models/phs";
import {
  buildDefaultPresentation,
  createControlBehavior,
} from "../services/comfort/controls/numericControl";
import {
  calculatePerInput,
  createFieldRequestAdapter,
} from "../services/comfort/requestMapping";
import {
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  buildResultSection,
  ComfortModelBuilder,
  parseEmptyOptions,
} from "../state/comfortTool/modelConfigs/builder";
import {
  getPhsWaterLossLimitG,
  simulatePhs,
} from "./phsCalculation";
import { buildPhsChart } from "./phsCharts";

const MODEL_LABEL = "PHS (ISO 7933:2023)";
const MODEL_DESCRIPTION =
  "Predicts heat strain, internal temperature, sweat loss, and allowable exposure time for hot environments.";
const REFERENCE_WATER_LOSS_LIMIT_G = getPhsWaterLossLimitG(phsReferencePerson);

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

export const phsChartableOutputs: readonly ModelOutput[] = [
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

const requestAdapter = createFieldRequestAdapter<PhsEnvironmentSi>({
  tdb: FieldKey.DryBulbTemperature,
  tr: FieldKey.MeanRadiantTemperature,
  v: FieldKey.WindSpeed,
  rh: FieldKey.RelativeHumidity,
  met: FieldKey.MetabolicRate,
  clo: FieldKey.ClothingInsulation,
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

const builder = new ComfortModelBuilder<
  PhsResponseDto,
  ModelChartSourceDto<PhsEnvironmentSi>
>(ComfortModel.Phs2023);

builder
  .setLabel(MODEL_LABEL)
  .setDescription(MODEL_DESCRIPTION)
  .setStandardIds([StandardId.Iso7933])
  .setModes([ChartMode.Compliance, ChartMode.Explore])
  .setChartableOutputs(phsChartableOutputs)
  .setComplianceSpec({
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
  .setCharts({
    defaultId: ChartId.PhsExposureHistory,
    entries: [
      {
        id: ChartId.PhsExposureHistory,
        name: "Exposure history",
        emptyMessage: "No PHS exposure history yet.",
        allowsAxisSelection: false,
        locksYAxis: false,
        showsZoneToggle: false,
        showsLegend: false,
        supportedExploreOutputs: [ModelOutputKey.PhsRectalTemperature],
        defaultExploreOutput: ModelOutputKey.PhsRectalTemperature,
        usesBaselineInput: true,
      },
      {
        id: ChartId.PhsDynamic,
        name: "Dynamic",
        emptyMessage: "No PHS field chart yet.",
        allowsAxisSelection: true,
        locksYAxis: false,
        showsZoneToggle: false,
        showsLegend: true,
        supportedExploreOutputs: phsChartableOutputs.map(({ key }) => key),
        defaultExploreOutput: ModelOutputKey.PhsLimitingExposureTime,
        usesBaselineInput: true,
      },
    ],
  });

builder.addControl({
  id: InputControlId.Temperature,
  behavior: createControlBehavior({
    controlId: InputControlId.Temperature,
    fieldKey: FieldKey.DryBulbTemperature,
    minValue: 15,
    maxValue: 50,
  }),
});
builder.addControl({
  id: InputControlId.RadiantTemperature,
  behavior: createControlBehavior({
    controlId: InputControlId.RadiantTemperature,
    fieldKey: FieldKey.MeanRadiantTemperature,
    minValue: 0,
    maxValue: 60,
  }),
});
builder.addControl({
  id: InputControlId.AirSpeed,
  behavior: createControlBehavior({
    controlId: InputControlId.AirSpeed,
    fieldKey: FieldKey.WindSpeed,
    minValue: 0,
    maxValue: 3,
    getPresentation: (context, meta) => ({
      ...buildDefaultPresentation(context, meta, { minValue: 0, maxValue: 3 }),
      label: "Air speed",
    }),
  }),
});
builder.addControl({
  id: InputControlId.Humidity,
  behavior: createControlBehavior({
    controlId: InputControlId.Humidity,
    fieldKey: FieldKey.RelativeHumidity,
    minValue: 0,
    maxValue: 100,
  }),
});
builder.addControl({
  id: InputControlId.MetabolicRate,
  behavior: createControlBehavior({
    controlId: InputControlId.MetabolicRate,
    fieldKey: FieldKey.MetabolicRate,
    minValue: 0.9,
    maxValue: 3.9,
  }),
});
builder.addControl({
  id: InputControlId.ClothingInsulation,
  behavior: createControlBehavior({
    controlId: InputControlId.ClothingInsulation,
    fieldKey: FieldKey.ClothingInsulation,
    minValue: 0.1,
    maxValue: 1,
  }),
});

builder.setCalculator((context, visibleInputIds) =>
  calculatePerInput({
    context,
    visibleInputIds,
    mapRequest: requestAdapter.mapRequest,
    calculate: (request) => simulatePhs({
      segments: [{
        id: "analysis-exposure",
        name: "Eight-hour assessment",
        durationMinutes: PHS_COMPLIANCE_HORIZON_MINUTES,
        ...request,
      }],
      person: phsReferencePerson,
      recordHistory: true,
    }),
  }));

builder.setResultBuilder((results, visibleInputIds, unitSystem) => {
  const temperatureMeta = getModelOutputDisplayMeta(
    ModelOutputKey.PhsRectalTemperature,
    unitSystem,
  );
  const waterLossMeta = getModelOutputDisplayMeta(
    ModelOutputKey.PhsWaterLoss,
    unitSystem,
  );
  return [
    buildResultSection(
      "Rectal-temperature exposure limit",
      results,
      visibleInputIds,
      (result) => result.valid
        ? { text: formatHours(result.dLimTreMinutes) }
        : invalidCell(result),
      "Maximum allowable exposure time",
    ),
    buildResultSection(
      "Water-loss exposure limit",
      results,
      visibleInputIds,
      (result) => result.valid
        ? { text: formatHours(result.dLimWaterLossMinutes) }
        : invalidCell(result),
      "Maximum allowable exposure time",
    ),
    buildResultSection(
      "Earliest limiting criterion",
      results,
      visibleInputIds,
      (result) => result.valid
        ? {
            text: formatHours(result.limitingExposureTimeMinutes),
            subtext: criterionLabel(result),
          }
        : invalidCell(result),
      "Maximum allowable exposure time",
    ),
    buildResultSection(
      "Rectal temperature after 8 h",
      results,
      visibleInputIds,
      (result) => {
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
      "End-of-exposure state",
    ),
    buildResultSection(
      "Predicted water loss after 8 h",
      results,
      visibleInputIds,
      (result) => {
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
      "End-of-exposure state",
    ),
  ];
});

builder.setChartBuilder((chartId, chartSource, resultsByInput, context) =>
  buildPhsChart({
    chartId,
    chartSource,
    resultsByInput,
    context,
    outputs: phsChartableOutputs,
    requestAdapter,
  }));
builder.setDynamicAxisFields([
  FieldKey.DryBulbTemperature,
  FieldKey.MeanRadiantTemperature,
  FieldKey.WindSpeed,
  FieldKey.RelativeHumidity,
  FieldKey.MetabolicRate,
  FieldKey.ClothingInsulation,
]);
builder.setDefaultDynamicAxes({
  xAxis: FieldKey.DryBulbTemperature,
  yAxis: FieldKey.RelativeHumidity,
});
builder.setDefaultOptions({});
builder.setOptionParser(parseEmptyOptions);

export const phsModelConfig = builder.build();
