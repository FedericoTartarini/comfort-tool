import { phs } from "jsthermalcomfort";
import { ModelId } from "../../catalog/modelIds";
import { PhysicalQuantityId, getPhysicalQuantityMeta, getQuantityDisplayMeta } from "../../catalog/quantities";
import {
  PhsPosture,
  PhsSegmentPreset,
  defaultPhsPersonSettings,
  phsReferenceEnvironment,
  type PhsPersonQuantityId,
  type PhsPersonSettingsSi,
  type PhsSimulationResult,
  type PhsTimeSeriesDraft,
  type PhsTimeSeriesSegment,
} from "../../catalog/phs";
import type {
  TimeSeriesControlDefinition,
  TimeSeriesModelDefinition,
  TimeSeriesNumberControlDefinition,
  TimeSeriesSimulationControls,
} from "../../catalog/timeSeries";
import {
  convertQuantityFromSi,
  convertQuantityToSi,
} from "../../engines/units";
import {
  PhsSimulationCancelledError,
  simulatePhs,
  validatePhsTimeSeries,
} from "./calculation";

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

const segmentPropertyByField = { [PhysicalQuantityId.DryBulbTemperature]: "tdb", [PhysicalQuantityId.MeanRadiantTemperature]: "tr", [PhysicalQuantityId.WindSpeed]: "v", [PhysicalQuantityId.RelativeHumidity]: "rh", [PhysicalQuantityId.MetabolicRate]: "met", [PhysicalQuantityId.ClothingInsulation]: "clo" } as const satisfies Partial<Record<PhysicalQuantityId, keyof PhsTimeSeriesSegment>>;

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
  return { ...defaultPhsPersonSettings };
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
      return convertQuantityFromSi(field, Number(segment[property]), unitSystem);
    },
    applyDisplayValue: (draft, rawValue, unitSystem, segmentId) => {
      const segment = findSegment(draft, segmentId);
      const displayValue = Number(rawValue);
      if (!segment || !Number.isFinite(displayValue)) return false;
      const valueSi = convertQuantityToSi(field, displayValue, unitSystem);
      if (segment[property] === valueSi) return false;
      Reflect.set(segment, property, valueSi);
      return true;
    },
    getDisplayUnits: (unitSystem) => getQuantityDisplayMeta(field, unitSystem).displayUnits,
    getStep: (unitSystem) => getQuantityDisplayMeta(field, unitSystem).step,
    getMin: (unitSystem) => convertQuantityFromSi(field, options.min, unitSystem),
    getMax: (unitSystem) => convertQuantityFromSi(field, options.max, unitSystem),
  };
}

function createPersonQuantityControl(options: {
  id: string;
  quantityId: PhsPersonQuantityId;
}): TimeSeriesNumberControlDefinition<PhsTimeSeriesDraft> {
  const { quantityId } = options;
  const meta = () => getPhysicalQuantityMeta(quantityId);
  return {
    kind: "number",
    id: options.id,
    get label() {
      return meta().label;
    },
    getDisplayValue: (draft, unitSystem) => (
      convertQuantityFromSi(quantityId, draft.person[quantityId], unitSystem)
    ),
    applyDisplayValue: (draft, rawValue, unitSystem) => {
      const displayValue = Number(rawValue);
      if (!Number.isFinite(displayValue)) return false;
      const valueSi = convertQuantityToSi(quantityId, displayValue, unitSystem);
      if (draft.person[quantityId] === valueSi) return false;
      draft.person[quantityId] = valueSi;
      return true;
    },
    getDisplayUnits: (unitSystem) => getQuantityDisplayMeta(quantityId, unitSystem).displayUnits,
    getStep: (unitSystem) => getQuantityDisplayMeta(quantityId, unitSystem).step,
    getMin: (unitSystem) => convertQuantityFromSi(quantityId, meta().minSi, unitSystem),
    getMax: (unitSystem) => convertQuantityFromSi(quantityId, meta().maxSi, unitSystem),
  };
}

const segmentControls = [
  createSegmentControl({
    id: PhsTimeSeriesControlId.DryBulbTemperature,
    field: PhysicalQuantityId.DryBulbTemperature,
    label: "Air temperature",
    min: 15,
    max: 50,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.MeanRadiantTemperature,
    field: PhysicalQuantityId.MeanRadiantTemperature,
    label: "Radiant temperature",
    min: 0,
    max: 60,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.AirSpeed,
    field: PhysicalQuantityId.WindSpeed,
    label: "Air speed",
    min: 0,
    max: 3,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.RelativeHumidity,
    field: PhysicalQuantityId.RelativeHumidity,
    label: "Relative humidity",
    min: 0,
    max: 100,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.MetabolicRate,
    field: PhysicalQuantityId.MetabolicRate,
    label: "Metabolic rate",
    min: 0.9,
    max: 3.9,
  }),
  createSegmentControl({
    id: PhsTimeSeriesControlId.ClothingInsulation,
    field: PhysicalQuantityId.ClothingInsulation,
    label: "Clothing insulation",
    min: 0.1,
    max: 1,
  }),
] as const;

const personQuantityControls = [
  createPersonQuantityControl({
    id: PhsTimeSeriesControlId.Weight,
    quantityId: PhysicalQuantityId.BodyWeight,
  }),
  createPersonQuantityControl({
    id: PhsTimeSeriesControlId.Height,
    quantityId: PhysicalQuantityId.Height,
  }),
] as const;

const personControls: readonly TimeSeriesControlDefinition<PhsTimeSeriesDraft>[] = [
  ...personQuantityControls,
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
      new URL("./timeSeries.worker.ts", import.meta.url),
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

export const phsTimeSeriesModelDefinition: TimeSeriesModelDefinition<
  PhsTimeSeriesDraft,
  PhsSimulationResult
> = {
  id: ModelId.Phs2023,
  label: phs.label,
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
};
