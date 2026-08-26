export const UnitSystem = {
  SI: "SI",
  IP: "IP",
} as const;

export type UnitSystem = (typeof UnitSystem)[keyof typeof UnitSystem];

/**
 * Canonical SI storage units in the assembled quantity catalog.
 * `display.units.SI` is this token; SI/IP display labels live in `display.displayUnits`.
 * New unit dimensions are frontend catalog work, not declaration-only work.
 */
export const SiUnit = {
  DegreeCelsius: "degC",
  MeterPerSecond: "m/s",
  Percent: "%",
  KilogramPerKilogram: "kg/kg",
  Met: "met",
  Clo: "clo",
  Pascal: "Pa",
  Degree: "deg",
  WattPerSquareMeter: "W/m2",
  Dimensionless: "1",
  Kilogram: "kg",
  Meter: "m",
} as const;

export type SiUnit = (typeof SiUnit)[keyof typeof SiUnit];

export function isSiUnit(value: string): value is SiUnit {
  return (Object.values(SiUnit) as string[]).includes(value);
}
