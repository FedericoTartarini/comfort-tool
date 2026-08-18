import {
  PhsPosture,
  type PhsTimeSeriesSegment,
} from "../../models/phs";
import { type PhsSegmentPreset } from "../../models/timeSeries";
import { ComfortModel } from "../../models/comfortModels";
import { FieldKey, type FieldKey as FieldKeyType } from "../../models/fieldKeys";
import { UnitSystem } from "../../models/units";
import {
  convertFieldValueFromSi,
  convertFieldValueToSi,
  convertLengthFromSi,
  convertLengthToSi,
  convertMassFromSi,
  convertMassToSi,
} from "../../services/units";
import { timeSeriesModelConfigs } from "./modelConfigs";
import type { TimeSeriesController, TimeSeriesStateSlice } from "./types";

const segmentPropertyByField = {
  [FieldKey.DryBulbTemperature]: "tdb",
  [FieldKey.MeanRadiantTemperature]: "tr",
  [FieldKey.WindSpeed]: "v",
  [FieldKey.RelativeHumidity]: "rh",
  [FieldKey.MetabolicRate]: "met",
  [FieldKey.ClothingInsulation]: "clo",
} as const satisfies Partial<Record<FieldKeyType, keyof PhsTimeSeriesSegment>>;

type SupportedSegmentField = keyof typeof segmentPropertyByField;

function isSupportedSegmentField(
  field: FieldKeyType,
): field is SupportedSegmentField {
  return field in segmentPropertyByField;
}

export function createTimeSeriesState(): TimeSeriesController {
  const definition = timeSeriesModelConfigs[ComfortModel.Phs2023];
  let nextSegmentNumber = 2;
  const state = $state<TimeSeriesStateSlice>({
    selectedModel: ComfortModel.Phs2023,
    unitSystem: UnitSystem.SI,
    segments: definition.createDefaultSegments(),
    person: definition.createDefaultSettings(),
    status: "idle",
    validationIssues: [],
    lastSuccessfulResult: null,
  });

  function markDirty() {
    state.status = state.lastSuccessfulResult ? "dirty" : "idle";
    state.validationIssues = [];
  }

  function findSegment(segmentId: string): PhsTimeSeriesSegment | undefined {
    return state.segments.find(({ id }) => id === segmentId);
  }

  function createSegmentId(): string {
    const id = `phs-segment-${nextSegmentNumber}`;
    nextSegmentNumber += 1;
    return id;
  }

  function toggleUnitSystem() {
    state.unitSystem = state.unitSystem === UnitSystem.SI
      ? UnitSystem.IP
      : UnitSystem.SI;
  }

  function updateSegmentName(segmentId: string, name: string) {
    const segment = findSegment(segmentId);
    if (!segment || segment.name === name) return;
    segment.name = name;
    markDirty();
  }

  function updateSegmentField(
    segmentId: string,
    field: FieldKeyType,
    rawDisplayValue: string,
  ): boolean {
    const segment = findSegment(segmentId);
    const displayValue = Number(rawDisplayValue);
    if (!segment || !isSupportedSegmentField(field) || !Number.isFinite(displayValue)) {
      return false;
    }
    const valueSi = convertFieldValueToSi(field, displayValue, state.unitSystem);
    const property = segmentPropertyByField[field];
    if (segment[property] === valueSi) return true;
    Reflect.set(segment, property, valueSi);
    markDirty();
    return true;
  }

  function updateSegmentDuration(segmentId: string, rawValue: string): boolean {
    const segment = findSegment(segmentId);
    const durationMinutes = Number(rawValue);
    if (!segment || !Number.isFinite(durationMinutes)) return false;
    if (segment.durationMinutes === durationMinutes) return true;
    segment.durationMinutes = durationMinutes;
    markDirty();
    return true;
  }

  function addSegment(preset: PhsSegmentPreset) {
    const previous = state.segments[state.segments.length - 1];
    state.segments.push(definition.createPresetSegment(
      createSegmentId(),
      preset,
      previous,
    ));
    markDirty();
  }

  function duplicateSegment(segmentId: string) {
    const index = state.segments.findIndex(({ id }) => id === segmentId);
    if (index < 0) return;
    const original = state.segments[index];
    state.segments.splice(index + 1, 0, {
      ...original,
      id: createSegmentId(),
      name: `${original.name} copy`,
    });
    markDirty();
  }

  function removeSegment(segmentId: string) {
    if (state.segments.length <= 1) return;
    const index = state.segments.findIndex(({ id }) => id === segmentId);
    if (index < 0) return;
    state.segments.splice(index, 1);
    markDirty();
  }

  function moveSegment(segmentId: string, direction: -1 | 1) {
    const index = state.segments.findIndex(({ id }) => id === segmentId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.segments.length) return;
    const [segment] = state.segments.splice(index, 1);
    state.segments.splice(target, 0, segment);
    markDirty();
  }

  function updatePersonNumber(
    field: "weightKg" | "heightM",
    rawDisplayValue: string,
  ): boolean {
    const displayValue = Number(rawDisplayValue);
    if (!Number.isFinite(displayValue)) return false;
    const valueSi = field === "weightKg"
      ? state.unitSystem === UnitSystem.IP
        ? convertMassToSi(displayValue) / 1000
        : displayValue
      : state.unitSystem === UnitSystem.IP
        ? convertLengthToSi(displayValue)
        : displayValue;
    if (state.person[field] === valueSi) return true;
    state.person[field] = valueSi;
    markDirty();
    return true;
  }

  function setPosture(posture: PhsPosture) {
    if (!Object.values(PhsPosture).includes(posture) || state.person.posture === posture) {
      return;
    }
    state.person.posture = posture;
    markDirty();
  }

  function setAcclimatized(value: boolean) {
    if (state.person.acclimatized === value) return;
    state.person.acclimatized = value;
    markDirty();
  }

  function setDrinkingAllowed(value: boolean) {
    if (state.person.drinkingAllowed === value) return;
    state.person.drinkingAllowed = value;
    markDirty();
  }

  function reset() {
    state.segments = definition.createDefaultSegments();
    state.person = definition.createDefaultSettings();
    state.unitSystem = UnitSystem.SI;
    state.status = "idle";
    state.validationIssues = [];
    state.lastSuccessfulResult = null;
    nextSegmentNumber = 2;
  }

  function runSimulation(): boolean {
    const validationIssues = definition.validate(state.segments, state.person);
    if (validationIssues.length > 0) {
      state.status = "error";
      state.validationIssues = validationIssues;
      return false;
    }
    state.status = "running";
    try {
      state.lastSuccessfulResult = definition.calculate(
        state.segments,
        state.person,
      );
      state.status = "ready";
      state.validationIssues = [];
      return true;
    } catch (error) {
      state.status = "error";
      state.validationIssues = [
        error instanceof Error ? error.message : "PHS simulation failed.",
      ];
      return false;
    }
  }

  function getSegmentDisplayValue(
    segment: PhsTimeSeriesSegment,
    field: FieldKeyType,
  ): number {
    if (!isSupportedSegmentField(field)) {
      throw new Error(`Unsupported PHS segment field: ${field}`);
    }
    const valueSi = Number(segment[segmentPropertyByField[field]]);
    return convertFieldValueFromSi(field, valueSi, state.unitSystem);
  }

  function getPersonDisplayValue(field: "weightKg" | "heightM"): number {
    const valueSi = state.person[field];
    if (state.unitSystem === UnitSystem.SI) return valueSi;
    return field === "weightKg"
      ? convertMassFromSi(valueSi * 1000)
      : convertLengthFromSi(valueSi);
  }

  return {
    state,
    actions: {
      toggleUnitSystem,
      updateSegmentName,
      updateSegmentField,
      updateSegmentDuration,
      addSegment,
      duplicateSegment,
      removeSegment,
      moveSegment,
      updatePersonNumber,
      setPosture,
      setAcclimatized,
      setDrinkingAllowed,
      reset,
      runSimulation,
    },
    selectors: {
      getSegmentDisplayValue,
      getPersonDisplayValue,
      getTotalDurationMinutes: () => state.segments.reduce(
        (total, segment) => total + segment.durationMinutes,
        0,
      ),
      hasStaleResult: () => (
        state.lastSuccessfulResult !== null
        && (state.status === "dirty" || state.status === "error")
      ),
      getCharts: () => state.lastSuccessfulResult
        ? definition.buildCharts(state.lastSuccessfulResult, state.unitSystem)
        : null,
    },
  };
}
