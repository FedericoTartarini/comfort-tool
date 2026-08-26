import type { NumericBand } from "../../../catalog/modelCapabilities";

export type NumericBandField = "min" | "max" | "label" | "color";

export interface NumericBandValidationIssue {
  code:
    | "empty"
    | "invalid-edge"
    | "invalid-range"
    | "missing-label"
    | "missing-color"
    | "unsorted"
    | "overlap";
  message: string;
  bandIndex?: number;
  field?: NumericBandField;
}

export interface NumericBandValidationResult {
  valid: boolean;
  issues: NumericBandValidationIssue[];
}

export function cloneNumericBands(bands: readonly NumericBand[]): NumericBand[] {
  return bands.map((band) => ({ ...band }));
}

export function sortNumericBands(bands: readonly NumericBand[]): NumericBand[] {
  return cloneNumericBands(bands).sort((left, right) => {
    if (left.min !== right.min) {
      return left.min - right.min;
    }
    return left.max - right.max;
  });
}

export function normalizeNumericBands(bands: readonly NumericBand[]): NumericBand[] {
  return sortNumericBands(bands).map((band) => ({
    ...band,
    label: band.label.trim(),
    color: band.color.trim(),
  }));
}

export function validateNumericBands(
  bands: readonly NumericBand[],
  options: { requireSorted?: boolean } = {},
): NumericBandValidationResult {
  const issues: NumericBandValidationIssue[] = [];

  if (bands.length === 0) {
    issues.push({
      code: "empty",
      message: "At least one band is required.",
    });
    return { valid: false, issues };
  }

  const validBands: Array<{ band: NumericBand; bandIndex: number }> = [];

  bands.forEach((band, bandIndex) => {
    const hasNumericMin = typeof band.min === "number" && !Number.isNaN(band.min);
    const hasNumericMax = typeof band.max === "number" && !Number.isNaN(band.max);
    const hasValidMin = hasNumericMin && band.min !== Number.POSITIVE_INFINITY;
    const hasValidMax = hasNumericMax && band.max !== Number.NEGATIVE_INFINITY;

    if (!hasValidMin) {
      issues.push({
        code: "invalid-edge",
        message: "Lower bounds must be numeric or unbounded below.",
        bandIndex,
        field: "min",
      });
    }

    if (!hasValidMax) {
      issues.push({
        code: "invalid-edge",
        message: "Upper bounds must be numeric or unbounded above.",
        bandIndex,
        field: "max",
      });
    }

    const hasValidRange = hasValidMin && hasValidMax && band.min < band.max;
    if (hasValidMin && hasValidMax && !hasValidRange) {
      issues.push({
        code: "invalid-range",
        message: "The lower bound must be less than the upper bound.",
        bandIndex,
      });
    }

    if (typeof band.label !== "string" || band.label.trim().length === 0) {
      issues.push({
        code: "missing-label",
        message: "Each band requires a label.",
        bandIndex,
        field: "label",
      });
    }

    if (typeof band.color !== "string" || band.color.trim().length === 0) {
      issues.push({
        code: "missing-color",
        message: "Each band requires a color.",
        bandIndex,
        field: "color",
      });
    }

    if (hasValidRange) {
      validBands.push({ band, bandIndex });
    }
  });

  if (options.requireSorted !== false) {
    validBands.slice(1).forEach(({ band, bandIndex }, validIndex) => {
      const previousBand = validBands[validIndex].band;
      if (band.min >= previousBand.min) return;
      issues.push({
        code: "unsorted",
        message: "Bands must be sorted by their lower bound.",
        bandIndex,
      });
    });
  }

  const bandsByLowerBound = [...validBands].sort((left, right) => {
    if (left.band.min !== right.band.min) {
      return left.band.min - right.band.min;
    }
    return left.band.max - right.band.max;
  });
  let coveredUntil = bandsByLowerBound[0]?.band.max;
  for (let index = 1; index < bandsByLowerBound.length; index += 1) {
    const { band, bandIndex } = bandsByLowerBound[index];
    if (coveredUntil !== undefined && band.min < coveredUntil) {
      issues.push({
        code: "overlap",
        message: "Bands cannot overlap.",
        bandIndex,
      });
    }
    coveredUntil = coveredUntil === undefined
      ? band.max
      : Math.max(coveredUntil, band.max);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
