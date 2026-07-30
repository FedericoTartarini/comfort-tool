export const ComfortModel = {
  PmvAshrae: "PMV_ASHRAE",
  PmvIso: "PMV_ISO",
  Utci: "UTCI",
  AdaptiveAshrae: "ADAPTIVE_ASHRAE",
  AdaptiveEn: "ADAPTIVE_EN",
  HeatIndex: "HEAT_INDEX",
  Humidex: "HUMIDEX",
  WindChill: "WIND_CHILL",
} as const;

export type ComfortModel = (typeof ComfortModel)[keyof typeof ComfortModel];

export const JsThermalComfortStandard = {
  ASHRAE: "ASHRAE",
  ISO: "ISO",
} as const;

export type JsThermalComfortStandard = (typeof JsThermalComfortStandard)[keyof typeof JsThermalComfortStandard];

/**
 * Standard compliance labels for calculation results.
 */
export const ComplianceStatus = {
  Compliant: "Compliant",
  NonCompliant: "Non-compliant",
  OutOfRange: "Out of range",
} as const;

export type ComplianceStatus = (typeof ComplianceStatus)[keyof typeof ComplianceStatus];
