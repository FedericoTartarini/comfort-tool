import type { airSpeedMode, clothingMode, humidityMode, temperatureMode } from "$lib/core/entryModes";
import type { ComfortZone } from "$lib/core/modelDeclaration";
import { formatNumber } from "$lib/core/numberFormat";

type IdOf<Modes extends Record<string, { readonly id: string }>> = Modes[keyof Modes]["id"];

/** Every entry mode's id, as core's mode tables carry them, so a mode without a description is a type error. */
export type EntryModeId =
  | IdOf<typeof temperatureMode>
  | IdOf<typeof humidityMode>
  | IdOf<typeof airSpeedMode>
  | IdOf<typeof clothingMode>;

/** The repository's address, a placeholder target for the footer's links (the Phase 5c spec, Out of Scope). */
const REPOSITORY = "https://github.com/FedericoTartarini/comfort-tool";
const LIBRARY_NAME = "jsthermalcomfort";

/**
 * UI copy, English only in v1 (ADR §2). Quantity names never appear here:
 * they come from `Quantity.label`. The one exception is `zoneLegend`'s |PMV|
 * (ADR-0002 decision 44).
 */
export const copy = {
  appTitle: "CBE Thermal Comfort Tool",
  // The page's header and footer (ADR-0002 decision 67, rules 6 and 7). The licence's
  // name and target, the Code link's target and the citation's text are placeholders
  // until the user decides them (the Phase 5c spec, Out of Scope).
  documentation: "Documentation",
  documentationAddress: `${REPOSITORY}/blob/main/docs/user-guide.md`,
  libraryName: LIBRARY_NAME,
  licence: "Licence",
  licenceAddress: REPOSITORY,
  code: "Code",
  codeAddress: REPOSITORY,
  citation:
    "Please cite us if you use this software: Tartarini, F., Schiavon, S., Cheung, T., Hoyt, T., 2020. " +
    "CBE Thermal Comfort Tool: online tool for thermal comfort calculations and visualizations. SoftwareX 12, 100563.",
  citationAddress: "https://doi.org/10.1016/j.softx.2020.100563",
  inputs: "Inputs",
  model: "Model",
  units: "Units",
  // The entry groups' names, each its menu button's whole text (ADR-0002 decision 72, rule 1).
  temperatureGroup: "Temperature",
  humidityGroup: "Humidity",
  airSpeedGroup: "Air speed",
  clothingGroup: "Clothing",
  // An entry mode in its group's menu, by the quantities it enters: "Dry-bulb air temperature and mean radiant temperature".
  entryModeChoice: (labels: readonly string[]) =>
    labels.map((label, index) => (index === 0 ? label : label.charAt(0).toLowerCase() + label.slice(1))).join(" and "),
  // The line under an entry mode in its menu: what is held or what follows when another input changes, never
  // the mode's name again (decision 72, rule 3).
  entryModeDescriptions: {
    separate: "The operative temperature follows the air speed.",
    operative: "Held as the air speed changes; used as both the air and the mean radiant temperature.",
    "relative-humidity": "Held as the temperature or the pressure changes; the humidity ratio follows.",
    "humidity-ratio": "Held as the temperature or the pressure changes; the relative humidity follows.",
    "dew-point": "Held as the temperature changes; the relative humidity follows.",
    "wet-bulb": "Held as the temperature changes; the relative humidity follows.",
    "vapour-pressure": "Held as the temperature changes; the relative humidity follows.",
    "air-speed": "The relative air speed follows the metabolic rate.",
    "relative-air-speed": "Held as the metabolic rate changes.",
    "clothing-insulation": "The dynamic clothing insulation follows the metabolic rate, and under ISO 7730 the air speed.",
    "dynamic-clothing-insulation": "Held as the metabolic rate or the air speed changes.",
  } satisfies Record<EntryModeId, string>,
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
  // One broken applicability row: `bound` already carries its unit.
  applicabilityWarning: (label: string, bound: string) => `${label} must be ${bound}`,
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
  // Reset and its question (ADR-0002 decision 63, rules 7 and 8).
  reset: "Reset",
  resetQuestion: "This returns the page to what a new tab at this address shows: every input, the units, the pressure, Compare, and the chart settings and Bands of every model. It cannot be undone.",
  resetAccept: "Yes, reset",
  resetDecline: "No, keep everything",
  // A share link's question in a tab that kept a session (ADR-0002 decision 63, rule 8).
  linkQuestionTitle: "Open the shared link?",
  linkQuestion: "This tab already holds a session. Opening the link replaces it, and that cannot be undone.",
  linkAccept: "Yes, open the link",
  linkDecline: "No, keep mine",
  // Copy link and the notice line (ADR-0002 decision 63, rules 6 and 7).
  copyLink: "Copy link",
  linkCopied: "Link copied",
  linkRefusedNotice: "The shared link could not be read, so nothing was opened from it.",
  linkFilledNotice: "Some of this link could not be used as written; what it lacked starts at its defaults.",
  copyRefusedNotice: "The link could not be copied.",
  closeNotice: "Close",
  // An Image of the chart (ADR-0002 decision 64, rules 6 and 8).
  exportImage: "Export image",
  imageTitle: "Title",
  imageSize: "Size",
  imageFormat: "Format",
  imageDownload: "Download",
  imageFailedNotice: "The image could not be made.",
  imageIncludesSummaryAndFooter: "Include input summary and footer",
  // The Input summary's lines (decision 64, rule 3): `label` is a quantity's with its unit, or an option's.
  summaryModel: (model: string, standard: string) => `${model} · ${standard}`,
  summaryValue: (label: string, value: string) => `${label}: ${value}`,
  // `output` is the cut quantity's label with its unit, `edges` the Edges in order.
  summaryEdges: (output: string, edges: string) => `Band edges, ${output}: ${edges}`,
  // The Image's footer, two lines (decision 64, rule 4): `day` as `2026-10-07`.
  footerTool: (name: string, version: string) => `${name} ${version}`,
  footerLibrary: (version: string, day: string) => `${LIBRARY_NAME} ${version} · ${day}`,
  standardCaption: (displayName: string, year: string) => `${displayName}:${year}`,
  notAvailable: "—",
  // A yes-or-no result cell (`acceptability_80`, `compliance`).
  yes: "Yes",
  no: "No",
  slotName: (index: number) => `Input ${index + 1}`,
  compare: "Compare",
  // A caption line about one row of the result table, while Compare is on.
  slotNote: (slotName: string, note: string) => `${slotName}: ${note}`,
  // A chart's legend entry or readout line of one slot, while the chart draws more than one.
  slotEntry: (slotName: string, entry: string) => `${slotName} · ${entry}`,
  chart: "Chart",
  xAxis: "X axis",
  yAxis: "Y axis",
  comfortZone: "Comfort zone",
  categoryZone: (category: string) => `Category ${category}`,
  zoneLegend: (zone: ComfortZone) =>
    `${zone.label} (|PMV| ${zone.inclusive ? "≤" : "<"} ${formatNumber(zone.limit)})`,
  // The Bands panel on Explore (ADR-0002 decision 59).
  bands: "Bands",
  bandsReset: "Reset bands",
  bandLabelColumn: "Label",
  bandColorColumn: "Colour",
  // `output` is the cut quantity's label with its unit.
  bandEdgeColumn: (output: string) => `Upper edge, ${output}`,
  bandNoColor: "No colour",
  bandAdd: "Add",
  bandRemove: "Remove",
  // A control's name for assistive technology: a band is named by its place, since its label may be empty.
  bandControl: (control: string, index: number) => `${control}, band ${index + 1}`,
} as const;
