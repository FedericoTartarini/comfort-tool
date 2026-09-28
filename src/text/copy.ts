import type { ComfortZone } from "$lib/core/modelDeclaration";
import { formatNumber } from "$lib/core/numberFormat";

/**
 * UI copy, English only in v1 (ADR §2). Quantity names never appear here:
 * they come from `Quantity.label`. The one exception is `zoneLegend`'s |PMV|
 * (ADR-0002 decision 44).
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
  applicabilityHint: "Outside the model's applicability:",
  // One broken applicability row: `range` already carries its unit.
  applicabilityWarning: (label: string, range: string) => `${label} must be ${range}`,
  // The model-switch dialog (ADR §4.5, ADR-0002 decision 32). Its own column
  // headings: "Input" heads quantity names here and slot names in the result
  // table, so the two are not one string.
  boundaryWarningTitle: "Boundary Range Warning",
  boundaryWarningIntro: (modelLabel: string) => `${modelLabel} does not accept every value you entered.`,
  boundaryWarningQuestion: "Adjust these values to the nearest allowed value and switch?",
  boundaryWarningAccept: "Yes, switch and adjust",
  boundaryWarningDecline: "No, stay here",
  boundaryWarningInputColumn: "Input",
  boundaryWarningCurrentColumn: "Current",
  boundaryWarningAllowedColumn: "Allowed range",
  standardCaption: (displayName: string, year: string) => `${displayName}:${year}`,
  notAvailable: "—",
  // A yes-or-no result cell (`acceptability_80`, `compliance`).
  yes: "Yes",
  no: "No",
  slotName: (index: number) => `Input ${index + 1}`,
  chart: "Chart",
  xAxis: "X axis",
  yAxis: "Y axis",
  comfortZone: "Comfort zone",
  categoryZone: (category: string) => `Category ${category}`,
  zoneLegend: (zone: ComfortZone) =>
    `${zone.label} (|PMV| ${zone.inclusive ? "≤" : "<"} ${formatNumber(zone.limit)})`,
} as const;
