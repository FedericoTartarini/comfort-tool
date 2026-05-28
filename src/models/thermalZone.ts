/**
 * @file thermalZone.ts
 * @description Class used for defining models' thermal comfort/risk zones
 */

export interface ThermalZoneConfig {
  id?: string;
  label: string;
  legendText?: string; // An optional abbreviated label for compact display contexts (e.g., chart annotations).
  min?: number;
  max?: number;
  color: string;
  textColor?: string;
  cssClass?: string;
  category?: string; // Used to match the category of the model to the correct zone (e.g., UTCI stress categories)
}

export class ThermalZone {
  public readonly id: string;
  public readonly label: string;
  public readonly legendText?: string;
  public readonly min: number;
  public readonly max: number;
  public readonly color: string;
  public readonly textColor: string;
  public readonly cssClass: string;
  public readonly category?: string;

  constructor(config: ThermalZoneConfig) {
    const derivedId = config.id ?? config.label.toLowerCase().replace(/\s+/g, '-');
    this.id = derivedId; // ID is derived from label if not provided (e.g., "Moderate Heat" -> "moderate-heat")
    this.label = config.label;
    this.legendText = config.legendText;
    this.min = config.min ?? -Infinity;
    this.max = config.max ?? Infinity;
    this.color = config.color;
    this.textColor = config.textColor ?? config.color;
    this.cssClass = config.cssClass ?? derivedId; // CSS class is derived from label if not provided (e.g., "Moderate Heat" -> "moderate-heat")
    this.category = config.category;
  }

  /**
   * Determines if a calculated index value falls within this specific boundary zone.
   * Supports both numeric float comparisons and strict string categorization matching.
   * 
   * @param value The calculated thermal index output (numeric or string category).
   * @returns True if the value matches the zone's defined thresholds.
   */
  public contains(value: number | string): boolean {
    if (typeof value === "string") {
      return value.toLowerCase() === this.category?.toLowerCase() || value.toLowerCase() === this.label.toLowerCase();
    }
    return value >= this.min && value < this.max;
  }
}
