import type { NumericBand } from "../../../models/modelCapabilities";

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

  bands.forEach((band, bandIndex) => {
    const hasNumericMin = typeof band.min === "number" && !Number.isNaN(band.min);
    const hasNumericMax = typeof band.max === "number" && !Number.isNaN(band.max);

    if (!hasNumericMin || band.min === Number.POSITIVE_INFINITY) {
      issues.push({
        code: "invalid-edge",
        message: "Lower bounds must be numeric or unbounded below.",
        bandIndex,
        field: "min",
      });
    }

    if (!hasNumericMax || band.max === Number.NEGATIVE_INFINITY) {
      issues.push({
        code: "invalid-edge",
        message: "Upper bounds must be numeric or unbounded above.",
        bandIndex,
        field: "max",
      });
    }

    if (hasNumericMin && hasNumericMax && band.min >= band.max) {
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

    if (bandIndex === 0) {
      return;
    }

    const previousBand = bands[bandIndex - 1];
    if (options.requireSorted !== false && band.min < previousBand.min) {
      issues.push({
        code: "unsorted",
        message: "Bands must be sorted by their lower bound.",
        bandIndex,
      });
    }

    if (band.min < previousBand.max) {
      issues.push({
        code: "overlap",
        message: "Bands cannot overlap.",
        bandIndex,
      });
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}
