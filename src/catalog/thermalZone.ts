import {
  resolveZoneAppearance,
  ZonePaletteKind,
  type ZoneToken,
} from "./zoneTokens";

export interface ThermalZoneConfig {
  id?: string;
  label: string;
  legendText?: string;
  min?: number;
  max?: number;
  /** Models select a catalog token; screen/print/colour-blind hex live on the theme table. */
  token?: ZoneToken;
  /** Hex fallback for tests and leftover custom colours. Prefer `token`. */
  color?: string;
  textColor?: string;
  cssClass?: string;
  category?: string;
}

export class ThermalZone {
  public readonly id: string;
  public readonly label: string;
  public readonly legendText?: string;
  public readonly min: number;
  public readonly max: number;
  public readonly token?: ZoneToken;
  public readonly color: string;
  public readonly textColor: string;
  public readonly cssClass: string;
  public readonly category?: string;

  constructor(config: ThermalZoneConfig) {
    const derivedId = config.id ?? config.label.toLowerCase().replace(/\s+/g, "-");
    this.id = derivedId;
    this.label = config.label;
    this.legendText = config.legendText;
    this.min = config.min ?? -Infinity;
    this.max = config.max ?? Infinity;
    this.token = config.token;
    const appearance = config.token === undefined
      ? undefined
      : resolveZoneAppearance(config.token, ZonePaletteKind.Screen);
    const color = config.color ?? appearance?.fill;
    if (color === undefined || color.trim().length === 0) {
      throw new Error(
        `Thermal zone "${config.label}" requires a zone token or a color.`,
      );
    }
    this.color = color;
    this.textColor = config.textColor ?? appearance?.text ?? color;
    this.cssClass = config.cssClass ?? config.token ?? derivedId;
    this.category = config.category;
  }

  /** Numeric zones are half-open: min <= value < max. */
  public contains(value: number | string): boolean {
    if (typeof value === "string") {
      return value.toLowerCase() === this.category?.toLowerCase()
        || value.toLowerCase() === this.label.toLowerCase();
    }
    return value >= this.min && value < this.max;
  }
}
