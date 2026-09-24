import { numericBandContains, numericBandFromToken, type NumericBand } from "./modelCapabilities";
import type { PhysicalQuantityId } from "./quantities";
import { ThermalZone } from "./thermalZone";
import type { ZoneToken } from "./zoneTokens";

/** One library classifier label mapped to a product colour token. */
export interface ClassifierTokenRow {
  readonly label: string;
  readonly token: ZoneToken;
  readonly legendText?: string;
}

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
export function tokenMapFromRows(
  tokens: readonly ClassifierTokenRow[],
): Readonly<Record<string, ZoneToken>> {
  return Object.fromEntries(tokens.map((row) => [row.label, row.token]));
}

function assertBinsTokenRows(
  bins: ClassifierBins,
  tokens: readonly ClassifierTokenRow[],
): void {
  if (tokens.length !== bins.labels.length) {
    throw new Error(
      `Classifier tokens length (${tokens.length}) must equal bins.labels length (${bins.labels.length}).`,
    );
  }
  for (const [index, row] of tokens.entries()) {
    if (row.label !== bins.labels[index]) {
      throw new Error(
        `Classifier token label "${row.label}" does not match bins.labels[${index}] "${bins.labels[index]}".`,
      );
    }
  }
}

/**
 * Colour JS digitize bins as Explore/Compliance `NumericBand`s.
 * Membership matches `mapping()`: right-closed uses `(min, max]`,
 * left-closed uses `[min, max)`.
 */
export function bandsFromJsBins(
  bins: ClassifierBins,
  tokens: readonly ClassifierTokenRow[] | Readonly<Record<string, ZoneToken>>,
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

  let tokensByLabel: Readonly<Record<string, ZoneToken>>;
  if (Array.isArray(tokens)) {
    const rows = tokens as readonly ClassifierTokenRow[];
    assertBinsTokenRows(bins, rows);
    tokensByLabel = tokenMapFromRows(rows);
  } else {
    tokensByLabel = tokens as Readonly<Record<string, ZoneToken>>;
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

export interface BinsInterval {
  readonly quantity: PhysicalQuantityId;
  readonly bins: ClassifierBins;
  readonly tokens: readonly ClassifierTokenRow[];
}

export interface BoundsInterval {
  readonly quantity: PhysicalQuantityId;
  readonly bounds: ClassifierBounds;
  readonly inside: ClassifierTokenRow;
  readonly outside: ClassifierTokenRow;
}

export interface OffsetTokenRow {
  readonly id: string;
  readonly token: ZoneToken;
}

export interface AdaptiveOffset {
  readonly id: string;
  readonly lower: number;
  readonly upper: number;
}

export interface OffsetsInterval {
  readonly quantity: PhysicalQuantityId;
  readonly offsets: readonly AdaptiveOffset[];
  readonly tokens: readonly OffsetTokenRow[];
}

export interface BandsInterval {
  readonly quantity: PhysicalQuantityId;
  readonly bands: readonly NumericBand[];
}

export type LibraryInterval =
  | BinsInterval
  | BoundsInterval
  | OffsetsInterval
  | BandsInterval;

export function intervalFromBins(
  quantity: PhysicalQuantityId,
  bins: ClassifierBins,
  tokens: readonly ClassifierTokenRow[],
): BinsInterval {
  assertBinsTokenRows(bins, tokens);
  return { quantity, bins, tokens };
}

export function intervalFromBounds(
  quantity: PhysicalQuantityId,
  bounds: ClassifierBounds,
  inside: ClassifierTokenRow,
  outside: ClassifierTokenRow,
): BoundsInterval {
  return { quantity, bounds, inside, outside };
}

export function intervalFromOffsets(
  quantity: PhysicalQuantityId,
  offsets: readonly AdaptiveOffset[],
  tokens: readonly OffsetTokenRow[],
): OffsetsInterval {
  if (tokens.length !== offsets.length) {
    throw new Error(
      `Offset tokens length (${tokens.length}) must equal offsets length (${offsets.length}).`,
    );
  }
  for (const [index, row] of tokens.entries()) {
    if (row.id !== offsets[index]?.id) {
      throw new Error(
        `Offset token id "${row.id}" does not match offsets[${index}].id "${offsets[index]?.id}".`,
      );
    }
  }
  return { quantity, offsets, tokens };
}

export function intervalFromBands(
  quantity: PhysicalQuantityId,
  bands: readonly NumericBand[],
): BandsInterval {
  return { quantity, bands };
}

export function numericBandsFromInterval(interval: LibraryInterval): NumericBand[] {
  if ("bins" in interval) {
    return bandsFromJsBins(interval.bins, interval.tokens);
  }
  if ("bounds" in interval) {
    return bandsFromJsBounds(
      interval.bounds,
      interval.inside,
      interval.outside,
    );
  }
  if ("offsets" in interval) {
    return interval.offsets.map((offset, index) =>
      numericBandFromToken(interval.tokens[index]!.token, {
        min: offset.lower,
        max: offset.upper,
        label: interval.tokens[index]!.id,
      }),
    );
  }
  return [...interval.bands];
}

export function tokenRowForValue(
  interval: LibraryInterval,
  valueSi: number,
): ClassifierTokenRow | undefined {
  const bands = numericBandsFromInterval(interval);
  const index = bands.findIndex((band) => numericBandContains(band, valueSi));
  if (index < 0) {
    return undefined;
  }
  if ("bins" in interval) {
    return interval.tokens[index];
  }
  if ("inside" in interval) {
    const band = bands[index]!;
    if (band.label === interval.inside.label) {
      return interval.inside;
    }
    return interval.outside;
  }
  return undefined;
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
