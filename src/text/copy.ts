/**
 * UI copy, English only in v1 (ADR §2). Quantity names never appear here:
 * they come from `Quantity.label`.
 */
export const copy = {
  appTitle: "CBE Thermal Comfort Tool",
  inputs: "Inputs",
  model: "Model",
  units: "Units",
  temperatureInput: "Temperature input",
  separateTemperatures: "Separate",
  operativeTemperature: "Operative",
  humidityInput: "Humidity input",
  presetTrigger: "Presets",
  presetSearchPlaceholder: "Search…",
  presetEmpty: "No matches.",
  inputColumn: "Input",
  complianceColumn: "Compliance",
  outOfRange: "Out of range — not calculated. Showing the last valid result.",
  applicabilityHint: "Outside the standard's applicability:",
  // The model-switch dialog (ADR §4.5, ADR-0002 decision 32). Its own column
  // headings: "Input" heads quantity names here and slot names in the result
  // table, so the two are not one string.
  boundaryWarningTitle: "Boundary Range Warning",
  boundaryWarningIntro: (model: string): string => `${model} does not accept every value you entered.`,
  boundaryWarningQuestion: "Adjust these values to the nearest allowed value and switch?",
  boundaryWarningAccept: "Yes, switch and adjust",
  boundaryWarningDecline: "No, stay here",
  boundaryWarningInputColumn: "Input",
  boundaryWarningCurrentColumn: "Current",
  boundaryWarningAllowedColumn: "Allowed range",
  standardCaption: (displayName: string, year: string): string => `${displayName}:${year}`,
  notAvailable: "—",
  slotName: (index: number): string => `Input ${index + 1}`,
  chart: "Chart",
  xAxis: "X axis",
  yAxis: "Y axis",
  comfortZone: (pmvLimit: number): string => `Comfort zone (|PMV| ≤ ${pmvLimit})`,
} as const;
