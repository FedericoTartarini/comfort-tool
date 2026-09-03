/**
 * UI copy, English only in v1 (ADR §2). Quantity names never appear here:
 * they come from `Quantity.label`.
 */
export const copy = {
  appTitle: "CBE Thermal Comfort Tool",
  inputs: "Inputs",
  units: "Units",
  temperatureInput: "Temperature input",
  separateTemperatures: "Separate",
  operativeTemperature: "Operative",
  inputColumn: "Input",
  complianceColumn: "Compliance",
  outOfRange: "Out of range — not calculated. Showing the last valid result.",
  notAvailable: "—",
  slotName: (index: number): string => `Input ${index + 1}`,
} as const;
