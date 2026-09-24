export const ModelId = {
  PmvAshrae: "pmv-ashrae",
  PmvIso: "pmv-iso",
  Utci: "utci",
  AdaptiveAshrae: "adaptive-ashrae",
  AdaptiveEn: "adaptive-en",
  HeatIndex: "heat-index",
  Humidex: "humidex",
  WindChill: "wind-chill",
  Phs2023: "phs-2023",
} as const;

export type ModelId = (typeof ModelId)[keyof typeof ModelId];

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
