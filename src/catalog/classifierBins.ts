import {
  numericBandFromToken,
  type NumericBand,
} from "./modelCapabilities";
import { ThermalZone } from "./thermalZone";
import type { ZoneToken } from "./zoneTokens";

/** Digitize-style bins exported by jsthermalcomfort classifiers. */
export interface ClassifierBins {
  readonly edges: readonly number[];
  readonly labels: readonly string[];
  readonly right: boolean;
}

/** Open or closed interval exported beside a boolean classifier (ASHRAE compliance). */
export interface ClassifierBounds {
  readonly min: number;
  readonly max: number;
  readonly open: boolean;
}

export function requireMappedCategory(
  category: string | number,
  context: string,
): string {
  if (typeof category !== "string" || category.length === 0) {
    throw new Error(`${context} classifier returned a non-string category.`);
  }
  return category;
}

/**
 * Title-case all-lowercase library classifier labels for display.
 * Mixed-case strings (PMV TSV, Humidex) stay unchanged.
 */
export function displayClassifierLabel(libraryLabel: string): string {
  if (libraryLabel.length === 0 || libraryLabel !== libraryLabel.toLowerCase()) {
    return libraryLabel;
  }
  return libraryLabel.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function libraryLabelForDisplay(
  displayLabel: string,
  tokensByLabel: Readonly<Record<string, ZoneToken>>,
): string {
  if (tokensByLabel[displayLabel] !== undefined) {
    return displayLabel;
  }
  const match = Object.keys(tokensByLabel).find(
    (libraryLabel) => displayClassifierLabel(libraryLabel) === displayLabel,
  );
  if (match === undefined) {
    throw new Error(`No ZoneToken for classifier label "${displayLabel}".`);
  }
  return match;
}

function tokenForLabel(
  label: string,
  tokensByLabel: Readonly<Record<string, ZoneToken>>,
): ZoneToken {
  const token = tokensByLabel[label];
  if (token === undefined) {
    throw new Error(`No ZoneToken for classifier label "${label}".`);
  }
  return token;
}

/**
 * Colour JS digitize bins as Explore/Compliance `NumericBand`s.
 * Membership matches `mapping()`: right-closed uses `(min, max]`,
 * left-closed uses `[min, max)`.
 */
export function bandsFromJsBins(
  bins: ClassifierBins,
  tokensByLabel: Readonly<Record<string, ZoneToken>>,
): NumericBand[] {
  const { edges, labels, right } = bins;
  if (
    labels.length !== edges.length &&
    labels.length !== edges.length + 1
  ) {
    throw new Error(
      "Classifier bins must have labels.length equal to edges.length or edges.length + 1.",
    );
  }

  return labels.map((libraryLabel, index) => {
    const min = index === 0 ? Number.NEGATIVE_INFINITY : edges[index - 1]!;
    const max = index < edges.length ? edges[index]! : Number.POSITIVE_INFINITY;
    return numericBandFromToken(tokenForLabel(libraryLabel, tokensByLabel), {
      min,
      max,
      label: displayClassifierLabel(libraryLabel),
      minInclusive: !right,
      maxInclusive: right,
    });
  });
}

export function thermalZonesFromBands(
  bands: readonly NumericBand[],
  tokensByLabel: Readonly<Record<string, ZoneToken>>,
  extrasByLabel?: Readonly<Record<string, { legendText?: string; category?: string }>>,
): ThermalZone[] {
  return bands.map((band) => {
    const libraryLabel = libraryLabelForDisplay(band.label, tokensByLabel);
    const extras = extrasByLabel?.[libraryLabel];
    return new ThermalZone({
      label: band.label,
      min: Number.isFinite(band.min) ? band.min : undefined,
      max: Number.isFinite(band.max) ? band.max : undefined,
      token: tokenForLabel(libraryLabel, tokensByLabel),
      legendText: extras?.legendText,
      category: extras?.category,
    });
  });
}

/**
 * Split the real line into outside / inside / outside around a classifier
 * interval. `open: true` is `min < value < max`.
 */
export function bandsFromJsBounds(
  bounds: ClassifierBounds,
  inside: { readonly label: string; readonly token: ZoneToken },
  outside: { readonly label: string; readonly token: ZoneToken },
): NumericBand[] {
  const endpointInclusive = bounds.open;
  return [
    numericBandFromToken(outside.token, {
      min: Number.NEGATIVE_INFINITY,
      max: bounds.min,
      label: outside.label,
      minInclusive: true,
      maxInclusive: endpointInclusive,
    }),
    numericBandFromToken(inside.token, {
      min: bounds.min,
      max: bounds.max,
      label: inside.label,
      minInclusive: !bounds.open,
      maxInclusive: !bounds.open,
    }),
    numericBandFromToken(outside.token, {
      min: bounds.max,
      max: Number.POSITIVE_INFINITY,
      label: outside.label,
      minInclusive: endpointInclusive,
      maxInclusive: true,
    }),
  ];
}
