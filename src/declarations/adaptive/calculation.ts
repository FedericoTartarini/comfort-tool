import { CalculationSource } from "../../catalog/calculationMetadata";
import { ComplianceStatus } from "../../catalog/modelIds";
import { PhysicalQuantityId, getPhysicalQuantityMeta } from "../../catalog/quantities";
import { unitLabel } from "../../catalog/units";
import {
  OptionKey,
  TemperatureMode,
  type AdaptiveModelOptions,
} from "../../catalog/inputModes";
import type { InputId as InputIdType } from "../../catalog/inputSlots";
import type { ModelCalculationContext } from "../../catalog/modelCalculation";
import {
  type Band,
  type BandEdge,
  type BandInputsSi,
  type ComplianceFeedback,
} from "../../catalog/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../catalog/units";
import { calculatePerInput, defineLibraryQuantityMapping } from "../../engines/comfort/requestMapping";
import { convertFieldValueFromSi, formatDisplayValue } from "../../engines/units";
import {
  hasExactKeys,
  isRecord,
  type ResultRowDefinition,
} from "../../state/modelRegistry/builder";
import type {
  AdaptiveBoundaryDefinition,
  AdaptiveLevelDefinition,
  AdaptiveLevelResult,
  AdaptiveOffsetSpec,
  AdaptiveLibraryLevelBounds,
  AdaptiveModelDeclaration,
  AdaptiveRequest,
  AdaptiveResponse,
} from "./shared";

export function libraryLevelsFromAdaptiveResult(
  result: object,
  levels: readonly AdaptiveLevelDefinition[],
): AdaptiveLibraryLevelBounds[] {
  const record = result as Record<string, unknown>;
  return levels.map((level) => {
    const lower = record[`tmp_cmf_${level.id}_low`];
    const upper = record[`tmp_cmf_${level.id}_up`];
    const accepted = record[`acceptability_${level.id}`];
    if (
      typeof lower !== "number"
      || typeof upper !== "number"
      || typeof accepted !== "boolean"
    ) {
      throw new Error(`Missing adaptive library bounds for ${level.id}`);
    }
    return {
      id: level.id,
      lower,
      upper,
      accepted,
    };
  });
}

function getAdaptiveIndoorTemperatures(inputsSi: BandInputsSi): {
  tdb: number;
  tr: number;
} {
  const tdb = inputsSi[PhysicalQuantityId.DryBulbTemperature];
  const tr = inputsSi[PhysicalQuantityId.MeanRadiantTemperature];
  return {
    tdb: typeof tdb === "number" && Number.isFinite(tdb) ? tdb : 25,
    tr: typeof tr === "number" && Number.isFinite(tr) ? tr : 25,
  };
}

function getAdaptiveTemperatureBoundaries(
  declaration: AdaptiveBoundaryDefinition,
  outdoorTemperature: number,
  airSpeed: number,
  indoor: { tdb: number; tr: number },
): number[] {
  const library = declaration.evaluateLibrary(
    {
      tdb: indoor.tdb,
      tr: indoor.tr,
      t_running_mean: outdoorTemperature,
      v: airSpeed,
    },
    { limitInputs: false },
  );
  return [
    ...library.levels.map(({ lower }) => lower).sort((left, right) => left - right),
    ...library.levels.map(({ upper }) => upper).sort((left, right) => left - right),
  ];
}

export function calculateAdaptive(
  declaration: AdaptiveModelDeclaration,
  payload: AdaptiveRequest,
): AdaptiveResponse {
  const library = declaration.evaluateLibrary(payload, { limitInputs: true });
  const isApplicable = Number.isFinite(library.tCmf);
  const levels = declaration.levels.map((level): AdaptiveLevelResult => {
    const bounds = library.levels.find(({ id }) => id === level.id);
    if (!bounds) {
      throw new Error(`Missing adaptive library bounds for ${level.id}`);
    }
    if (
      !isApplicable
      || !Number.isFinite(bounds.lower)
      || !Number.isFinite(bounds.upper)
    ) {
      return {
        id: level.id,
        label: level.label,
        accepted: false,
        status: null,
        lower: null,
        upper: null,
      };
    }
    return {
      id: level.id,
      label: level.label,
      accepted: bounds.accepted,
      status: bounds.accepted
        ? level.label
        : library.operativeTemperature < bounds.lower
          ? declaration.bandSequence[0].label
          : declaration.bandSequence[declaration.bandSequence.length - 1]?.label ?? null,
      lower: bounds.lower,
      upper: bounds.upper,
    };
  });

  return {
    tCmf: library.tCmf,
    operativeTemperature: library.operativeTemperature,
    levels,
    isApplicable,
    standard: declaration.resultStandard,
    source: CalculationSource.JsThermalComfort,
  };
}

export function getLevelResult(
  result: AdaptiveResponse,
  levelId: string,
): AdaptiveLevelResult {
  const level = result.levels.find(({ id }) => id === levelId);
  if (!level) throw new Error(`Missing adaptive result level: ${levelId}`);
  return level;
}

export function createAdaptiveComplianceFeedbackGetter(
  complianceLevelId: string,
): (result: AdaptiveResponse) => ComplianceFeedback {
  return (result) => {
    if (!result.isApplicable) {
      return { text: ComplianceStatus.OutOfRange, passes: false };
    }
    const passes = getLevelResult(result, complianceLevelId).accepted;
    return {
      text: passes ? ComplianceStatus.Compliant : ComplianceStatus.NonCompliant,
      passes,
    };
  };
}

function formatAdaptiveOffset(offset: number): string {
  if (!Number.isFinite(offset)) {
    throw new Error(`Adaptive compliance offsets must be finite; received ${offset}.`);
  }
  return offset < 0 ? `− ${Math.abs(offset)}` : `+ ${offset}`;
}

export function createAdaptiveComplianceCaption(
  declaration: AdaptiveBoundaryDefinition,
  complianceLevelId: string,
): string {
  const offset = declaration.offsets.find(({ id }) => id === complianceLevelId);
  if (!offset) {
    throw new Error(`Missing adaptive library offset for ${complianceLevelId}`);
  }
  return `${complianceLevelId}: t_cmf ${formatAdaptiveOffset(offset.lower)}°C to t_cmf ${formatAdaptiveOffset(offset.upper)}°C`;
}

export function levelsFromAdaptiveOffsets(
  offsets: readonly AdaptiveOffsetSpec[],
): readonly AdaptiveLevelDefinition[] {
  return offsets.map(({ id }) => ({ id, label: id }));
}

export function parseAdaptiveOptions(value: unknown): AdaptiveModelOptions | null {
  if (!isRecord(value) || !hasExactKeys(value, [OptionKey.TemperatureMode])) {
    return null;
  }
  const temperatureMode = value[OptionKey.TemperatureMode];
  if (
    temperatureMode !== TemperatureMode.Air
    && temperatureMode !== TemperatureMode.Operative
  ) {
    return null;
  }
  return { [OptionKey.TemperatureMode]: temperatureMode };
}

export const adaptiveQuantityMapping = defineLibraryQuantityMapping<AdaptiveRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  t_running_mean: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
  v: PhysicalQuantityId.RelativeAirSpeed,
});

export function toAdaptiveRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
): AdaptiveRequest {
  const request = adaptiveQuantityMapping.mapRequest(context, inputId);
  if (context.options[OptionKey.TemperatureMode] === TemperatureMode.Operative) {
    request.tr = request.tdb;
  }
  return request;
}

export function createAdaptiveComplianceBands(
  declaration: AdaptiveBoundaryDefinition,
): readonly Band[] {
  const getRelativeAirSpeed = (inputsSi: BandInputsSi): number => {
    const airSpeed = inputsSi[PhysicalQuantityId.RelativeAirSpeed];
    if (typeof airSpeed !== "number" || !Number.isFinite(airSpeed)) {
      throw new Error(
        "Adaptive boundary bands require finite canonical-SI relative air speed.",
      );
    }
    return airSpeed;
  };
  const internalEdges: BandEdge[] = Array.from(
    { length: declaration.bandSequence.length - 1 },
    (_, boundaryIndex) => (outdoorTemperatureSi, inputsSi) => (
      getAdaptiveTemperatureBoundaries(
        declaration,
        outdoorTemperatureSi,
        getRelativeAirSpeed(inputsSi),
        getAdaptiveIndoorTemperatures(inputsSi),
      )[boundaryIndex]
    ),
  );

  return declaration.bandSequence.map((zone, index): Band => ({
    min: index === 0 ? -Infinity : internalEdges[index - 1],
    max: index === declaration.bandSequence.length - 1
      ? Infinity
      : internalEdges[index],
    label: zone.label,
    color: zone.color,
  }));
}

export function buildAdaptiveResultRows(
  declaration: AdaptiveModelDeclaration,
  unitSystem: UnitSystemType,
): ResultRowDefinition<AdaptiveResponse>[] {
  const temperatureUnits = unitLabel(
    getPhysicalQuantityMeta(PhysicalQuantityId.DryBulbTemperature).siUnit,
    unitSystem,
  );
  return [
    {
      title: "Compliance",
      formatter: (result) => {
        const feedback = declaration.complianceProfile.getFeedback(result);
        return {
          text: feedback.text,
          color: feedback.passes
            ? declaration.complianceColors.compliant
            : declaration.complianceColors.nonCompliant,
        };
      },
    },
    ...declaration.levels.map((definition): ResultRowDefinition<AdaptiveResponse> => ({
      title: definition.label,
      formatter: (result) => {
        const level = getLevelResult(result, definition.id);
        if (level.status === null || level.lower === null || level.upper === null) {
          return { text: "N/A", color: declaration.colorByStatus["N/A"] ?? "" };
        }
        const lower = convertFieldValueFromSi(
          PhysicalQuantityId.DryBulbTemperature,
          level.lower,
          unitSystem,
        );
        const upper = convertFieldValueFromSi(
          PhysicalQuantityId.DryBulbTemperature,
          level.upper,
          unitSystem,
        );
        return {
          text: level.status,
          subtext: `${formatDisplayValue(lower)} ~ ${formatDisplayValue(upper)} ${temperatureUnits}`,
          color: declaration.colorByStatus[level.status] ?? "",
        };
      },
    })),
  ];
}


export function calculateAdaptiveModel(
  context: ModelCalculationContext,
  visibleInputIds: InputIdType[],
  declaration: AdaptiveModelDeclaration,
) {
  return calculatePerInput({
    context,
    visibleInputIds,
    mapRequest: toAdaptiveRequest,
    calculate: (request) => calculateAdaptive(declaration, request),
  });
}
