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
  // Two captions for one state (ADR-0002 decision 33): the gate keeps the last
  // valid inputs of the *current* model, so a model reached with an entry out of
  // range has nothing to show. The caller picks by whether it holds a result.
  outOfRangeKeptResult: "Out of range — not calculated. Showing the last valid result.",
  outOfRangeEmptyResult: "Out of range — not calculated. This model has no earlier result to show.",
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
  comfortZone: "Comfort zone",
  categoryZone: (category: string): string => `Category ${category}`,
  zoneLegend: (zone: { label: string; limit: number; inclusive: boolean }): string =>
    `${zone.label} (|PMV| ${zone.inclusive ? "≤" : "<"} ${zone.limit})`,
} as const;
