export interface ThermalZoneConfig {
  id?: string;
  label: string;
  legendText?: string;
  min?: number;
  max?: number;
  color: string;
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
    this.color = config.color;
    this.textColor = config.textColor ?? config.color;
    this.cssClass = config.cssClass ?? derivedId;
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
