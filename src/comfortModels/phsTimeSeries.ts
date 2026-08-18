import { ComfortModel } from "../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../models/fieldKeys";
import { fieldMetaByKey } from "../models/inputFieldsMeta";
import { ModelOutputKey } from "../models/modelCapabilities";
import {
  PhsLimitingCriterion,
  PhsPosture,
  PhsSegmentPreset,
  phsReferenceEnvironment,
  phsReferencePerson,
  type PhsPersonSettingsSi,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
  type PhsTimeSeriesSegment,
} from "../models/phs";
import type {
  TimeSeriesControlDefinition,
  TimeSeriesModelDefinition,
  TimeSeriesNumberControlDefinition,
  TimeSeriesSimulationControls,
} from "../models/timeSeries";
import { UnitSystem } from "../models/units";
import {
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
  convertModelOutputFromSi,
  formatDisplayValue,
  getModelOutputDisplayMeta,
} from "../services/units";
import {
  PhsSimulationCancelledError,
  simulatePhs,
  validatePhsTimeSeries,
} from "./phsCalculation";
import {
  buildPhsTemperatureTimeSeriesChart,
  buildPhsWaterLossTimeSeriesChart,
} from "./phsTimeSeriesCharts";

const PhsTimeSeriesControlId = {
  DryBulbTemperature: "phs-dry-bulb-temperature",
  MeanRadiantTemperature: "phs-mean-radiant-temperature",
  AirSpeed: "phs-air-speed",
  RelativeHumidity: "phs-relative-humidity",
  MetabolicRate: "phs-metabolic-rate",
  ClothingInsulation: "phs-clothing-insulation",
  Weight: "phs-weight",
  Height: "phs-height",
  Posture: "phs-posture",
  Acclimatized: "phs-acclimatized",
  DrinkingAllowed: "phs-drinking-allowed",
} as const;

const segmentPropertyByField = {
  [FieldKey.DryBulbTemperature]: "tdb",
  [FieldKey.MeanRadiantTemperature]: "tr",
  [FieldKey.WindSpeed]: "v",
  [FieldKey.RelativeHumidity]: "rh",
  [FieldKey.MetabolicRate]: "met",
  [FieldKey.ClothingInsulation]: "clo",
} as const satisfies Partial<Record<FieldKeyType, keyof PhsTimeSeriesSegment>>;

type PhsSegmentField = keyof typeof segmentPropertyByField;

interface PhsWorkerProgressMessage {
  type: "progress";
  progress: number;
}

interface PhsWorkerResultMessage {
  type: "result";
  result: PhsSimulationResult;
}

interface PhsWorkerErrorMessage {
  type: "error";
  message: string;
}

type PhsWorkerMessage =
  | PhsWorkerProgressMessage
  | PhsWorkerResultMessage
  | PhsWorkerErrorMessage;

function findSegment(
  draft: PhsTimeSeriesDraft,
  segmentId?: string,
): PhsTimeSeriesSegment | undefined {
  return segmentId
    ? draft.segments.find(({ id }) => id === segmentId)
    : undefined;
}

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

export function createDefaultPhsTimeSeriesDraft(): PhsTimeSeriesDraft {
  return {
    segments: createDefaultPhsSegments(),
    person: createDefaultPhsPersonSettings(),
  };
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

function createSegmentControl(options: {
  id: string;
  field: PhsSegmentField;
  label: string;
  min: number;
  max: number;
}): TimeSeriesNumberControlDefinition<PhsTimeSeriesDraft> {
  const { field } = options;
  const property = segmentPropertyByField[field];
  return {
    kind: "number",
    id: options.id,
    label: options.label,
    getDisplayValue: (draft, unitSystem, segmentId) => {
      const segment = findSegment(draft, segmentId);
      if (!segment) return Number.NaN;
      return convertFieldValueFromSi(field, Number(segment[property]), unitSystem);
    },
    applyDisplayValue: (draft, rawValue, unitSystem, segmentId) => {
      const segment = findSegment(draft, segmentId);
      const displayValue = Number(rawValue);
      if (!segment || !Number.isFinite(displayValue)) return false;
      const valueSi = convertFieldValueToSi(field, displayValue, unitSystem);
      if (segment[property] === valueSi) return false;
      Reflect.set(segment, property, valueSi);
      return true;
    },
    getDisplayUnits: (unitSystem) => fieldMetaByKey[field].displayUnits[unitSystem],
    getStep: () => fieldMetaByKey[field].step,
    getMin: (unitSystem) => convertFieldValueFromSi(field, options.min, unitSystem),
    getMax: (unitSystem) => convertFieldValueFromSi(field, options.max, unitSystem),
  };
}

const segmentControls = [
  createSegmentControl({
    id: PhsTimeSeriesControlId.DryBulbTemperature,
    field: FieldKey.DryBulbTemperature,
    label: "Air temperature",
    min: 15,
    max: 50,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.MeanRadiantTemperature,
    field: FieldKey.MeanRadiantTemperature,
    label: "Radiant temperature",
    min: 0,
    max: 60,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.AirSpeed,
    field: FieldKey.WindSpeed,
    label: "Air speed",
    min: 0,
    max: 3,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.RelativeHumidity,
    field: FieldKey.RelativeHumidity,
    label: "Relative humidity",
    min: 0,
    max: 100,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.MetabolicRate,
    field: FieldKey.MetabolicRate,
    label: "Metabolic rate",
    min: 0.9,
    max: 3.9,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.ClothingInsulation,
    field: FieldKey.ClothingInsulation,
    label: "Clothing insulation",
    min: 0.1,
    max: 1,
  }),
] as const;

const personControls: readonly TimeSeriesControlDefinition<PhsTimeSeriesDraft>[] = [
  {
    kind: "number",
    id: PhsTimeSeriesControlId.Weight,
    label: "Body weight",
    getDisplayValue: (draft, unitSystem) => (
      unitSystem === UnitSystem.IP
        ? convertMassFromSi(draft.person.weightKg * 1000)
        : draft.person.weightKg
    ),
    applyDisplayValue: (draft, rawValue, unitSystem) => {
      const displayValue = Number(rawValue);
      if (!Number.isFinite(displayValue)) return false;
      const valueSi = unitSystem === UnitSystem.IP
        ? convertMassToSi(displayValue) / 1000
        : displayValue;
      if (draft.person.weightKg === valueSi) return false;
      draft.person.weightKg = valueSi;
      return true;
    },
    getDisplayUnits: (unitSystem) => unitSystem === UnitSystem.IP ? "lb" : "kg",
    getStep: (unitSystem) => unitSystem === UnitSystem.IP ? 0.5 : 0.1,
  },
  {
    kind: "number",
    id: PhsTimeSeriesControlId.Height,
    label: "Body height",
    getDisplayValue: (draft, unitSystem) => (
      unitSystem === UnitSystem.IP
        ? convertLengthFromSi(draft.person.heightM)
        : draft.person.heightM
    ),
    applyDisplayValue: (draft, rawValue, unitSystem) => {
      const displayValue = Number(rawValue);
      if (!Number.isFinite(displayValue)) return false;
      const valueSi = unitSystem === UnitSystem.IP
        ? convertLengthToSi(displayValue)
        : displayValue;
      if (draft.person.heightM === valueSi) return false;
      draft.person.heightM = valueSi;
      return true;
    },
    getDisplayUnits: (unitSystem) => unitSystem === UnitSystem.IP ? "ft" : "m",
    getStep: () => 0.01,
  },
  {
    kind: "select",
    id: PhsTimeSeriesControlId.Posture,
    label: "Posture",
    items: [
      { name: "Sitting", value: PhsPosture.Sitting },
      { name: "Standing", value: PhsPosture.Standing },
      { name: "Crouching", value: PhsPosture.Crouching },
    ],
    getValue: (draft) => draft.person.posture,
    applyValue: (draft, value) => {
      if (
        !Object.values(PhsPosture).includes(value as PhsPosture)
        || draft.person.posture === value
      ) {
        return false;
      }
      draft.person.posture = value as PhsPosture;
      return true;
    },
  },
  {
    kind: "toggle",
    id: PhsTimeSeriesControlId.Acclimatized,
    label: "Heat acclimatized",
    getValue: (draft) => draft.person.acclimatized,
    applyValue: (draft, value) => {
      if (draft.person.acclimatized === value) return false;
      draft.person.acclimatized = value;
      return true;
    },
  },
  {
    kind: "toggle",
    id: PhsTimeSeriesControlId.DrinkingAllowed,
    label: "Drinking allowed",
    getValue: (draft) => draft.person.drinkingAllowed,
    applyValue: (draft, value) => {
      if (draft.person.drinkingAllowed === value) return false;
      draft.person.drinkingAllowed = value;
      return true;
    },
  },
];

function cloneDraft(draft: PhsTimeSeriesDraft): PhsTimeSeriesDraft {
  return {
    segments: draft.segments.map((segment) => ({ ...segment })),
    person: { ...draft.person },
  };
}

function fallbackSimulation(
  draft: PhsTimeSeriesDraft,
  controls: TimeSeriesSimulationControls,
): Promise<PhsSimulationResult> {
  return Promise.resolve().then(() => {
    if (controls.signal.aborted) throw new PhsSimulationCancelledError();
    const result = simulatePhs(
      {
        segments: draft.segments,
        person: draft.person,
        recordHistory: true,
      },
      {
        isCancelled: () => controls.signal.aborted,
        onProgress: (completed, total) => {
          controls.onProgress(total > 0 ? completed / total : 1);
        },
      },
    );
    if (!result.valid) throw new Error(result.issues.join(" "));
    return result;
  });
}

function simulateInWorker(
  draft: PhsTimeSeriesDraft,
  controls: TimeSeriesSimulationControls,
): Promise<PhsSimulationResult> {
  if (controls.signal.aborted) {
    return Promise.reject(new PhsSimulationCancelledError());
  }
  if (typeof Worker === "undefined") {
    return fallbackSimulation(draft, controls);
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./phsTimeSeries.worker.ts", import.meta.url),
      { type: "module" },
    );
    const abort = () => {
      worker.terminate();
      reject(new PhsSimulationCancelledError());
    };
    controls.signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<PhsWorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        controls.onProgress(message.progress);
        return;
      }
      controls.signal.removeEventListener("abort", abort);
      worker.terminate();
      if (message.type === "result") {
        resolve(message.result);
      } else {
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      controls.signal.removeEventListener("abort", abort);
      worker.terminate();
      reject(new Error(event.message || "PHS worker simulation failed."));
    };
    worker.postMessage(draft);
  });
}

function formatMinute(minute: number | null): string {
  return minute === null ? "Not reached" : `${(minute / 60).toFixed(2)} h`;
}

function limitingCriterionLabel(result: PhsSimulationResult): string {
  if (result.limitingCriterion === PhsLimitingCriterion.None) {
    return "No limit reached";
  }
  return result.limitingCriterion === PhsLimitingCriterion.RectalTemperature
    ? "Rectal temperature"
    : "Water loss";
}

export const phsTimeSeriesModelDefinition: TimeSeriesModelDefinition<
  PhsTimeSeriesDraft,
  PhsSimulationResult
> = {
  id: ComfortModel.Phs2023,
  label: "Predicted Heat Strain (PHS)",
  description:
    "Build an ordered work sequence and calculate ISO 7933:2023 minute by minute.",
  standardLabel: "ISO 7933:2023",
  reference: {
    label: "CBE Thermal Comfort Tool PHS",
    href: "https://comfort.cbe.berkeley.edu/phs",
    note: "The reference page documents the older 2004 edition; this workspace calculates ISO 7933:2023.",
  },
  createDefaultDraft: createDefaultPhsTimeSeriesDraft,
  cloneDraft,
  validate: (draft) => validatePhsTimeSeries(draft.segments, draft.person),
  editor: {
    presets: [
      { id: PhsSegmentPreset.Work, label: "Work" },
      { id: PhsSegmentPreset.Rest, label: "Rest" },
    ],
    segmentControls,
    settingsSections: [{
      id: "phs-person-settings",
      title: "Advanced person settings",
      testId: "phs-advanced-settings",
      controls: personControls,
    }],
    getSegments: (draft) => draft.segments,
    createSegmentId: (sequence) => `phs-segment-${sequence}`,
    updateSegmentName: (draft, segmentId, name) => {
      const segment = findSegment(draft, segmentId);
      if (!segment || segment.name === name) return false;
      segment.name = name;
      return true;
    },
    updateSegmentDuration: (draft, segmentId, rawValue) => {
      const segment = findSegment(draft, segmentId);
      const durationMinutes = Number(rawValue);
      if (
        !segment
        || !Number.isFinite(durationMinutes)
        || segment.durationMinutes === durationMinutes
      ) {
        return false;
      }
      segment.durationMinutes = durationMinutes;
      return true;
    },
    addSegment: (draft, segmentId, presetId) => {
      if (!Object.values(PhsSegmentPreset).includes(presetId as PhsSegmentPreset)) {
        return false;
      }
      draft.segments.push(createPhsPresetSegment(
        segmentId,
        presetId as PhsSegmentPreset,
        draft.segments[draft.segments.length - 1],
      ));
      return true;
    },
    duplicateSegment: (draft, sourceSegmentId, newSegmentId) => {
      const index = draft.segments.findIndex(({ id }) => id === sourceSegmentId);
      if (index < 0) return false;
      const source = draft.segments[index];
      draft.segments.splice(index + 1, 0, {
        ...source,
        id: newSegmentId,
        name: `${source.name} copy`,
      });
      return true;
    },
    removeSegment: (draft, segmentId) => {
      if (draft.segments.length <= 1) return false;
      const index = draft.segments.findIndex(({ id }) => id === segmentId);
      if (index < 0) return false;
      draft.segments.splice(index, 1);
      return true;
    },
    moveSegment: (draft, segmentId, direction) => {
      const index = draft.segments.findIndex(({ id }) => id === segmentId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= draft.segments.length) return false;
      const [segment] = draft.segments.splice(index, 1);
      draft.segments.splice(target, 0, segment);
      return true;
    },
  },
  simulate: simulateInWorker,
  buildSummary: (result, unitSystem) => {
    const temperatureMeta = getModelOutputDisplayMeta(
      ModelOutputKey.PhsRectalTemperature,
      unitSystem,
    );
    const waterLossMeta = getModelOutputDisplayMeta(
      ModelOutputKey.PhsWaterLoss,
      unitSystem,
    );
    const peakTemperature = convertModelOutputFromSi(
      ModelOutputKey.PhsRectalTemperature,
      result.peakRectalTemperatureC,
      unitSystem,
    );
    const finalWaterLoss = convertModelOutputFromSi(
      ModelOutputKey.PhsWaterLoss,
      result.sweatLossG,
      unitSystem,
    );
    return [
      {
        id: "phs-peak-rectal-temperature",
        label: "Peak rectal temperature",
        value: `${formatDisplayValue(peakTemperature, temperatureMeta.decimals)} ${temperatureMeta.displayUnits}`,
      },
      {
        id: "phs-first-rectal-limit",
        label: "First 38 °C exceedance",
        value: formatMinute(result.firstRectalLimitMinute),
      },
      {
        id: "phs-final-water-loss",
        label: "Final water loss",
        value: `${formatDisplayValue(finalWaterLoss, waterLossMeta.decimals)} ${waterLossMeta.displayUnits}`,
      },
      {
        id: "phs-first-water-loss-limit",
        label: "Water-loss limit",
        value: formatMinute(result.firstWaterLossLimitMinute),
      },
      {
        id: "phs-limiting-criterion",
        label: "Limiting criterion",
        value: limitingCriterionLabel(result),
        ...(result.limitingMinute !== null
          ? { subtext: formatMinute(result.limitingMinute) }
          : {}),
      },
    ];
  },
  charts: [
    {
      id: "phs-temperature-history",
      title: "Body temperature",
      description:
        "Rectal temperature, optional core temperature, the 38 °C limit, and phase boundaries.",
      emptyMessage: "The temperature history will appear after calculation.",
      heightClass: "h-[390px]",
      testId: "phs-temperature-chart",
      build: (result, draft, unitSystem) => (
        buildPhsTemperatureTimeSeriesChart(result, draft, unitSystem)
      ),
    },
    {
      id: "phs-water-loss-history",
      title: "Predicted water loss",
      description:
        "Cumulative water loss against the applicable 5% or 3% body-mass limit.",
      emptyMessage: "The water-loss history will appear after calculation.",
      heightClass: "h-[360px]",
      testId: "phs-water-loss-chart",
      build: (result, draft, unitSystem) => (
        buildPhsWaterLossTimeSeriesChart(result, draft, unitSystem)
      ),
    },
  ],
};
