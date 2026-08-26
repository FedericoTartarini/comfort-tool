import { t_o } from "jsthermalcomfort";
import { CalculationSource } from "../../models/calculationMetadata";
import { ComplianceStatus } from "../../models/comfortModels";
import { PhysicalQuantityId, getQuantityPresentationMeta } from "../../models/physicalQuantities";
import {
  OptionKey,
  TemperatureMode,
  type AdaptiveModelOptions,
} from "../../models/inputModes";
import type { InputId as InputIdType } from "../../models/inputSlots";
import type { ModelCalculationContext } from "../../models/modelCalculation";
import {
  type Band,
  type BandEdge,
  type BandInputsSi,
  type ComplianceFeedback,
} from "../../models/modelCapabilities";
import type { UnitSystem as UnitSystemType } from "../../models/units";
import { calculatePerInput, createFieldRequestAdapter } from "../../services/comfort/requestMapping";
import { convertFieldValueFromSi } from "../../services/units";
import {
  hasExactKeys,
  isRecord,
  type ResultRowDefinition,
} from "../../state/comfortTool/modelConfigs/builder";
import type {
  AdaptiveBoundaryDefinition,
  AdaptiveLevelDefinition,
  AdaptiveLevelResult,
  AdaptiveModelDeclaration,
  AdaptiveRequest,
  AdaptiveResponse,
} from "./adaptiveShared";

export function getCe(airSpeed: number, unadjustedUpperBoundary: number): number {
  if (airSpeed < 0.6 || unadjustedUpperBoundary < 25) return 0;
  if (airSpeed < 0.9) return 1.2;
  if (airSpeed < 1.2) return 1.8;
  return 2.2;
}

function getBaseComfortTemperature(
  declaration: AdaptiveBoundaryDefinition,
  outdoorTemperature: number,
): number {
  return declaration.coefficients.slope * outdoorTemperature
    + declaration.coefficients.intercept;
}

function getLevelBoundaries(
  declaration: AdaptiveBoundaryDefinition,
  level: AdaptiveLevelDefinition,
  outdoorTemperature: number,
  airSpeed: number,
): { lower: number; upper: number } {
  const tCmf = getBaseComfortTemperature(declaration, outdoorTemperature);
  const unadjustedUpper = tCmf + level.warmOffset;
  return {
    lower: tCmf + level.coolOffset,
    upper: unadjustedUpper + getCe(airSpeed, unadjustedUpper),
  };
}

function getAdaptiveTemperatureBoundaries(
  declaration: AdaptiveBoundaryDefinition,
  outdoorTemperature: number,
  airSpeed: number,
): number[] {
  const boundaries = declaration.levels.map((level) =>
    getLevelBoundaries(declaration, level, outdoorTemperature, airSpeed));
  return [
    ...boundaries.map(({ lower }) => lower).sort((left, right) => left - right),
    ...boundaries.map(({ upper }) => upper).sort((left, right) => left - right),
  ];
}

export function calculateAdaptive(
  declaration: AdaptiveModelDeclaration,
  payload: AdaptiveRequest,
): AdaptiveResponse {
  const operativeTemperature = t_o(
    payload.tdb,
    payload.tr,
    payload.v,
    declaration.operativeTemperatureStandard,
  );
  const applicabilityResult = declaration.evaluateApplicability(payload);
  const isApplicable = Number.isFinite(applicabilityResult);
  const tCmf = isApplicable
    ? getBaseComfortTemperature(declaration, payload.trm)
    : NaN;
  const levels = declaration.levels.map((level): AdaptiveLevelResult => {
    if (!isApplicable) {
      return {
        id: level.id,
        label: level.label,
        accepted: false,
        status: null,
        lower: null,
        upper: null,
      };
    }
    const { lower, upper } = getLevelBoundaries(
      declaration,
      level,
      payload.trm,
      payload.v,
    );
    const accepted = operativeTemperature >= lower && operativeTemperature < upper;
    return {
      id: level.id,
      label: level.label,
      accepted,
      status: accepted
        ? level.label
        : operativeTemperature < lower
          ? declaration.bandSequence[0].label
          : declaration.bandSequence[declaration.bandSequence.length - 1]?.label ?? null,
      lower,
      upper,
    };
  });

  return {
    tCmf,
    operativeTemperature,
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
  shadingDescription: string,
  declaration: AdaptiveBoundaryDefinition,
  complianceLevelId: string,
): string {
  const level = declaration.levels.find(({ id }) => id === complianceLevelId);
  if (!level) {
    throw new Error(`Missing adaptive compliance level: ${complianceLevelId}`);
  }
  const rangeLabel = level.label.replace(/ Acceptability$/, "");
  return `${shadingDescription}; compliance is the ${rangeLabel} range from t_cmf ${formatAdaptiveOffset(level.coolOffset)}°C to t_cmf ${formatAdaptiveOffset(level.warmOffset)}°C, including the applicable upper-limit cooling adjustment.`;
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

export const adaptiveRequestAdapter = createFieldRequestAdapter<AdaptiveRequest>({
  tdb: PhysicalQuantityId.DryBulbTemperature,
  tr: PhysicalQuantityId.MeanRadiantTemperature,
  trm: PhysicalQuantityId.PrevailingMeanOutdoorTemperature,
  v: PhysicalQuantityId.RelativeAirSpeed,
});

export function toAdaptiveRequest(
  context: ModelCalculationContext,
  inputId: InputIdType,
): AdaptiveRequest {
  const request = adaptiveRequestAdapter.mapRequest(context, inputId);
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
  const temperatureUnits = getQuantityPresentationMeta(
    PhysicalQuantityId.DryBulbTemperature,
    unitSystem,
  ).displayUnits;
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
          subtext: `${lower.toFixed(1)} ~ ${upper.toFixed(1)} ${temperatureUnits}`,
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
