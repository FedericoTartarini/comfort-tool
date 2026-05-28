/**
 * Chart Visualization Registry
 * 
 * This file serves as the central registry for all charts available in the comfort tool.
 * It defines unique chart identifiers (ChartId) and maps them to UI metadata, including 
 * display names, layout constraints (e.g. height classes), and empty-state messaging.
 */

// This object is a set of unique string values used to identify each chart type.
export const ChartId = {
  Psychrometric: "psychrometric", // PMV (ASHRAE) psychrometric chart
  Stress: "stress", // UTCI (Heat stress) psychrometric chart
  Adaptive: "adaptive", // Adaptive psychrometric chart
  AdaptiveDynamic: "adaptiveDynamic", //  Adaptive dynamic chart
  PmvDynamic: "pmvDynamic", // PMV (ASHRAE) dynamic chart
  UtciDynamic: "utciDynamic", // UTCI (Heat stress) dynamic chart
  HeatIndexRanges: "heatIndexRanges", // Heat index chart
  HeatIndexDynamic: "heatIndexDynamic", // Heat index dynamic chart
  Humidex: "humidex", // Humidex chart
  HumidexDynamic: "humidexDynamic", // Humidex dynamic chart
  WindChillDynamic: "windChillDynamic", // Wind chill dynamic chart
} as const;

// This type is a union of all the ChartId values. It is used to ensure type safety when
// working with ChartIds in the application.
export type ChartId = (typeof ChartId)[keyof typeof ChartId];

/**
 * Defines the metadata for each chart type in the registry
 * @type {ChartMetaById}
 * @property {string} name - The name of the chart.
 * @property {string} emptyMessage - The message to display when there is no data for the chart.
 * @property {string} heightClass - The Tailwind CSS class for the height of the chart.
 * @property {boolean} isDynamic - Whether the chart is dynamic (has selectable X and Y axes).
 * @property {boolean} lockYAxis - Whether the Y-axis should be locked, used when the chart has only 2 inputs.
 */

export interface ChartMetadata {
  name: string;
  emptyMessage: string;
  heightClass: string;
  isDynamic?: boolean; // optional, defaults to false
}

export const chartMetaById: Record<ChartId, ChartMetadata> = {
  [ChartId.Psychrometric]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.Stress]: {
    name: "UTCI",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.Adaptive]: {
    name: "Adaptive",
    emptyMessage: "No adaptive chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.AdaptiveDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    isDynamic: true,
  },
  [ChartId.PmvDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    isDynamic: true,
  },
  [ChartId.UtciDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    isDynamic: true,
  },
  [ChartId.HeatIndexRanges]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.HeatIndexDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    isDynamic: true,
  },
  [ChartId.Humidex]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.HumidexDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    isDynamic: true,
  },
  [ChartId.WindChillDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
    isDynamic: true,
  },
};
