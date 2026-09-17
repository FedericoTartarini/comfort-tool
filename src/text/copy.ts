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
  standardCaption: (displayName: string, year: string): string => `${displayName}:${year}`,
  notAvailable: "—",
  slotName: (index: number): string => `Input ${index + 1}`,
  chart: "Chart",
  xAxis: "X axis",
  yAxis: "Y axis",
  comfortZone: (pmvLimit: number): string => `Comfort zone (|PMV| ≤ ${pmvLimit})`,
} as const;
