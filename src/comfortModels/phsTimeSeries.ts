import { ComfortModel } from "../models/comfortModels";
import {
  phsReferenceEnvironment,
  phsReferencePerson,
  type PhsPersonSettingsSi,
  type PhsTimeSeriesResult,
  type PhsTimeSeriesSegment,
} from "../models/phs";
import {
  PhsSegmentPreset,
  type TimeSeriesModelDefinition,
} from "../models/timeSeries";
import {
  calculatePhsTimeSeries,
  validatePhsTimeSeries,
} from "./phsCalculation";
import {
  buildPhsTemperatureTimeSeriesChart,
  buildPhsWaterLossTimeSeriesChart,
} from "./phsTimeSeriesCharts";

export function createDefaultPhsSegments(): PhsTimeSeriesSegment[] {
  return [{
    id: "phs-segment-1",
    name: "CBE reference exposure",
    durationMinutes: 480,
    ...phsReferenceEnvironment,
  }];
}

export function createDefaultPhsPersonSettings(): PhsPersonSettingsSi {
  return { ...phsReferencePerson };
}

export function createPhsPresetSegment(
  id: string,
  preset: PhsSegmentPreset,
  previous?: PhsTimeSeriesSegment,
): PhsTimeSeriesSegment {
  const environment = previous
    ? {
        tdb: previous.tdb,
        tr: previous.tr,
        v: previous.v,
        rh: previous.rh,
        met: previous.met,
        clo: previous.clo,
      }
    : phsReferenceEnvironment;
  const isWork = preset === PhsSegmentPreset.Work;
  return {
    id,
    name: isWork ? "Work" : "Rest",
    durationMinutes: isWork ? 45 : 15,
    ...environment,
    met: isWork ? 2.6 : 1.2,
  };
}

export const phsTimeSeriesModelDefinition: TimeSeriesModelDefinition<
  PhsTimeSeriesSegment,
  PhsPersonSettingsSi,
  PhsTimeSeriesResult
> = {
  id: ComfortModel.Phs2023,
  label: "Predicted Heat Strain (PHS)",
  description:
    "Minute-by-minute heat-strain simulation for changing work and environmental conditions.",
  standardLabel: "ISO 7933:2023",
  createDefaultSegments: createDefaultPhsSegments,
  createDefaultSettings: createDefaultPhsPersonSettings,
  createPresetSegment: createPhsPresetSegment,
  validate: validatePhsTimeSeries,
  calculate: calculatePhsTimeSeries,
  buildCharts: (result, unitSystem) => ({
    primary: buildPhsTemperatureTimeSeriesChart(result, unitSystem),
    secondary: buildPhsWaterLossTimeSeriesChart(result, unitSystem),
  }),
};
