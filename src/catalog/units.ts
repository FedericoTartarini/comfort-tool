export const UnitSystem = {
  SI: "SI",
  IP: "IP",
} as const;

export type UnitSystem = (typeof UnitSystem)[keyof typeof UnitSystem];

/**
 * Canonical SI storage units in the assembled quantity catalog.
 * Display labels live on `siUnitLabel` / `ipUnitLabel`, not on quantity meta.
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
  Gram: "g",
  Meter: "m",
  Minute: "min",
  KelvinDelta: "deltaK",
} as const;

export type SiUnit = (typeof SiUnit)[keyof typeof SiUnit];

export const IpUnit = {
  DegreeFahrenheit: "degF",
  FootPerSecond: "ft/s",
  Percent: "%",
  GrainPerPound: "gr/lb",
  Met: "met",
  Clo: "clo",
  InchOfMercury: "inHg",
  Degree: "deg",
  BtuPerHourSquareFoot: "Btu/(h·ft2)",
  Dimensionless: "1",
  Pound: "lb",
  Foot: "ft",
  Hour: "h",
  DeltaFahrenheit: "deltaF",
} as const;

export type IpUnit = (typeof IpUnit)[keyof typeof IpUnit];

export const siUnitLabel: Record<SiUnit, string> = {
  [SiUnit.DegreeCelsius]: "°C",
  [SiUnit.MeterPerSecond]: "m/s",
  [SiUnit.Percent]: "%",
  [SiUnit.KilogramPerKilogram]: "g/kg",
  [SiUnit.Met]: "met",
  [SiUnit.Clo]: "clo",
  [SiUnit.Pascal]: "kPa",
  [SiUnit.Degree]: "°",
  [SiUnit.WattPerSquareMeter]: "W/m²",
  [SiUnit.Dimensionless]: "",
  [SiUnit.Kilogram]: "kg",
  [SiUnit.Gram]: "kg",
  [SiUnit.Meter]: "m",
  [SiUnit.Minute]: "h",
  [SiUnit.KelvinDelta]: "°C",
};

export const ipUnitLabel: Record<IpUnit, string> = {
  [IpUnit.DegreeFahrenheit]: "°F",
  [IpUnit.FootPerSecond]: "ft/s",
  [IpUnit.Percent]: "%",
  [IpUnit.GrainPerPound]: "gr/lb",
  [IpUnit.Met]: "met",
  [IpUnit.Clo]: "clo",
  [IpUnit.InchOfMercury]: "inHg",
  [IpUnit.Degree]: "°",
  [IpUnit.BtuPerHourSquareFoot]: "Btu/(h·ft²)",
  [IpUnit.Dimensionless]: "",
  [IpUnit.Pound]: "lb",
  [IpUnit.Foot]: "ft",
  [IpUnit.Hour]: "h",
  [IpUnit.DeltaFahrenheit]: "°F",
};

export function isSiUnit(value: string): value is SiUnit {
  return (Object.values(SiUnit) as string[]).includes(value);
}

export function isIpUnit(value: string): value is IpUnit {
  return (Object.values(IpUnit) as string[]).includes(value);
}

export function unitLabel(
  units: { SI: SiUnit; IP: IpUnit },
  unitSystem: UnitSystem,
): string {
  return unitSystem === UnitSystem.SI
    ? siUnitLabel[units.SI]
    : ipUnitLabel[units.IP];
}
