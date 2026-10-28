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
  // The two marks on the header's and the footer's bands, each a link to its institution (ADR-0002 decision 73,
  // rule 5): the name is the mark's text alternative.
  cbeName: "Center for the Built Environment",
  cbeAddress: "https://cbe.berkeley.edu/",
  berkeleyName: "University of California, Berkeley",
  berkeleyAddress: "https://www.berkeley.edu/",
  // The sidebar's group labels after Standard, which is the Standard page's title (decision 73, rule 6): the session
  // controls' group reads "Settings", the users' word, not the project's (rule 6 as revised 2026-10-15).
  tools: "Tools",
  settings: "Settings",
  inputs: "Inputs",
  results: "Results",
  model: "Model",
  units: "Units",
  // The Explore model select's heading over the models with no standard (ADR-0002 decision 74, rule 4).
  otherModels: "Other",
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
  // A row's menu button holds the row's presets alone (ADR-0002 decision 75, rule 6).
  presetTrigger: "Presets",
  // The input calculators' entry at the Inputs card's foot, its second line the calculators' names, and the dialog's
  // title (decision 75, rule 6 (a) and (b)).
  inputCalculators: "Input calculators",
  calculatorNames: (labels: readonly string[]) => labels.join(" · "),
  calculatorApply: "Apply",
  // The footer's slot checkboxes while the slots are named (decision 75, rule 6 (c)).
  calculatorApplyTo: "Apply to",
  restoreDefaults: "Restore defaults",
  // The input calculators' tab names, and Solar gain's postures in the standard's words (ADR-0002 decision 75).
  customEnsemble: "Custom ensemble",
  clothingFromOutdoorTemperature: "Clothing from outdoor temperature",
  solarGainOnOccupants: "Solar gain on occupants",
  postureSeated: "Seated",
  postureStanding: "Standing",
  postureSupine: "Supine",
  posture: "Posture",
  // The line each calculator's tab opens with, naming the standard's method, its citation last (decision 75,
  // rule 6 (b); the wording the user's, 2026-10-15).
  solarGainMethod: "The mean radiant temperature increase equivalent to the solar gain (ASHRAE 55 Normative Appendix C).",
  customEnsembleMethod:
    "The sum of the garments' insulation, plus a chair's for ensembles of 0.5 to 1.2 clo standing (ASHRAE 55 §5.2.2.2(c) and (d)).",
  clothingFromOutdoorTemperatureMethod:
    "The clothing of the day predicted from the outdoor air temperature at 6 a.m. (ASHRAE 55 §5.2.2.2(f)).",
  // The result dock's line for a slot: the row's value before and after Apply, and an after outside the row's bound
  // with that bound named as its limit, "44.98 (limit 10 – 40)" (decision 75, rule 6 (d); worded by the user,
  // 2026-10-15).
  calculatorChangeJoiner: " → ",
  calculatorCutTo: (after: string, bound: string) => `${after} (limit ${bound})`,
  // Custom ensemble's rows: the search box above them and its empty list; a row's list button, "Change" on Chairs
  // while a chair is worn; a worn garment's remove button; Clear at the title's right; and the sum.
  ensembleSearchPlaceholder: "Search garments…",
  ensembleEmpty: "No garment matches.",
  ensembleAdd: "Add",
  ensembleChange: "Change",
  ensembleRemove: (garment: string) => `Remove ${garment}`,
  ensembleClear: "Clear",
  ensembleInsulation: "Ensemble insulation",
  presetSearchPlaceholder: "Search…",
  presetEmpty: "No matches.",
  inputColumn: "Input",
  complianceColumn: "Compliance",
  // A result row's button for the limits its run broke, its accessible name, and the heading of the popover it opens
  // and of a slot's broken limits in an Image's Input summary (ADR-0002 decision 84, rule 8), the heading in decision
  // 83's words: "limits", the standards' word for both kinds of bound.
  limitsBroken: "Limits broken",
  limitsBrokenHeading: "Calculated, but outside these limits:",
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
  // Share, and the notices a link and Share raise (ADR-0002 decision 63, rules 6 and 7; rule 7's button as noted 2026-10-27).
  share: "Share",
  linkCopied: "Link copied",
  linkRefusedNotice: "The shared link could not be read, so nothing was opened from it.",
  linkFilledNotice: "Some of this link could not be used as written; what it lacked starts at its defaults.",
  copyRefusedNotice: "The link could not be copied.",
  // An arrival that cut values to their bounds (decision 84, rule 4, as noted 2026-10-28).
  valuesCutNotice: "Some values were out of range and were cut to the nearest allowed value.",
  // A toast's close button (decision 84, rule 7).
  closeToast: "Close",
  // What a refused value's toast says (decision 84, rules 2 and 7): `subject` is the box's quantity, with its slot
  // under Compare; `value` carries its unit; each reason is a bound sentence, of what the value would break.
  refusedNotice: (subject: string, value: string, reasons: readonly string[]) =>
    reasons.length === 1
      ? `${subject} was not changed to ${value}, which would put another value out of range. ${reasons[0]}. Change it first.`
      : `${subject} was not changed to ${value}, which would put other values out of range. ${reasons.join(". ")}. Change them first.`,
  // A run that broke a limit it did not break before (decision 84, rule 8): each reason is a bound sentence.
  limitsBrokenNotice: (reasons: readonly string[]) => `Calculated, but outside ${reasons.length === 1 ? "a limit" : "limits"}. ${reasons.join(". ")}.`,
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
  // The chart marker's legend entry while its slot has no name: the one slot of a page that compares nothing. Its
  // own string beside the two "Input" column headings, three places that say the word.
  unnamedMarker: "Input",
  // The accessible name of one slot's control in a row that stands over several slots, on Compare.
  slotControl: (control: string, slotName: string) => `${control}, ${slotName}`,
  compare: "Compare",
  // A switch's state beside it, under Compare, where its label stands above the slot columns (ADR-0002 decision 76,
  // rule 2).
  on: "On",
  off: "Off",
  // A caption line about one row of the result table, while Compare is on.
  slotNote: (slotName: string, note: string) => `${slotName}: ${note}`,
  // A chart's legend entry or readout line of one slot, while the slots are named.
  slotEntry: (slotName: string, entry: string) => `${slotName} · ${entry}`,
  chart: "Chart",
  // The chart type toggle-group's name, on the chart card's view row with no visible label (ADR-0002 decision 73, rule 8).
  chartType: "Chart type",
  xAxis: "X axis",
  yAxis: "Y axis",
  comfortZone: "Comfort zone",
  categoryZone: (category: string) => `Category ${category}`,
  zoneLegend: (zone: ComfortZone) =>
    `${zone.label} (|PMV| ${zone.inclusive ? "≤" : "<"} ${formatNumber(zone.limit)})`,
  // The line under the plot of a slot whose Comfort zones are all empty, whatever emptied them (ADR-0002 decision 83
  // rule 1, as noted 2026-10-22).
  noComfortZone: "No comfort zone at these inputs.",
  // The Bands panel on Explore (ADR-0002 decision 59), in a dialog the chart's heading row opens (decision 73, rule 8).
  bands: "Bands",
  bandsReset: "Reset bands",
  bandsApply: "Apply",
  bandLabelColumn: "Label",
  bandColorColumn: "Colour",
  // `output` is the cut quantity's label with its unit.
  bandEdgeColumn: (output: string) => `Upper edge, ${output}`,
  bandNoColor: "No colour",
  bandAdd: "Add",
  bandRemove: "Remove",
  // Why an Edge typed out of order was not taken, in its cell until that Edge is next typed in (ADR-0002 decision 84,
  // rule 6): `edge` and its neighbours carry the unit; the first band has no Edge below, the last none above.
  bandEdgeRefused: (edge: string, below: string | undefined, above: string | undefined) =>
    below === undefined
      ? `Not taken: ${edge} is not below ${above}, the next edge.`
      : above === undefined
        ? `Not taken: ${edge} is not above ${below}, the edge before it.`
        : `Not taken: ${edge} is not between ${below} and ${above}, the edges beside it.`,
  // A band's legend entry and hover line while its label is empty, as Add leaves it (ADR-0002 decision 59's note of
  // 2026-10-17); the Band list keeps the empty label.
  unlabelledBand: "Unlabelled band",
  // A control's name for assistive technology: a band is named by its place, since its label may be empty.
  bandControl: (control: string, index: number) => `${control}, band ${index + 1}`,
} as const;
