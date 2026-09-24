export const CalculationSource = {
  JsThermalComfort: "jsthermalcomfort",
  FrontendGenerated: "frontend-generated",
} as const;

export type CalculationSource = (typeof CalculationSource)[keyof typeof CalculationSource];

export const ComfortStandard = {
  Ashrae55PmvPpd: "ASHRAE 55 (PMV/PPD)",
  Iso7730PmvPpd: "ISO 7730 Category B (PMV/PPD)",
  Ashrae55Adaptive: "ASHRAE 55 (Adaptive)",
  En16798Adaptive: "EN 16798-1 (Adaptive)",
} as const;

export type ComfortStandard = (typeof ComfortStandard)[keyof typeof ComfortStandard];
