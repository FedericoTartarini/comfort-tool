/**
 * PMV Comfort Zones Metadata
 * 
 * Defines the standardized thermal sensation categories for the PMV model,
 * including thresholds, labels, and color mappings.
 */

// PMV Zone Identifiers.
export type PmvZoneId =
  | "cold"
  | "cool"
  | "slightlyCool"
  | "neutral"
  | "slightlyWarm"
  | "warm"
  | "hot";

// Interface for PMV zone metadata.
export interface PmvZoneMeta {
  id: PmvZoneId;
  label: string;
  min: number;
  max: number;
  color: string;
}

// Defines the PMV zones and their corresponding values.
export const pmvZones = [
  { id: "cold", label: "Cold", min: -Infinity, max: -2.5, color: "#0571b0" },
  { id: "cool", label: "Cool", min: -2.5, max: -1.5, color: "#4c78a8" },
  { id: "slightlyCool", label: "Slightly Cool", min: -1.5, max: -0.5, color: "#92c5de" },
  { id: "neutral", label: "Neutral", min: -0.5, max: 0.5, color: "#f2f2f2" },
  { id: "slightlyWarm", label: "Slightly Warm", min: 0.5, max: 1.5, color: "#f4a582" },
  { id: "warm", label: "Warm", min: 1.5, max: 2.5, color: "#e15759" },
  { id: "hot", label: "Hot", min: 2.5, max: Infinity, color: "#cc79a7" },
] as const satisfies readonly PmvZoneMeta[];

/**
 * Resolves the metadata for a PMV value.
 * @param pmv - The predicted mean vote value.
 * @returns The metadata for the matching thermal sensation zone.
 */
export function getPmvZoneMeta(pmv: number): PmvZoneMeta {
  // If PMV value is not a number, return the first zone.
  if (isNaN(pmv)) return pmvZones[0];
  
  // Return the zone that the PMV value falls into.
  return pmvZones.find((zone) => pmv >= zone.min && pmv < zone.max) ?? pmvZones[0];
}
