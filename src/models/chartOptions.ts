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
  Humidex: "humidex", // Humidex chart
  WindChill: "windChill", // Wind chill chart
} as const;

// This type is a union of all the ChartId values. It is used to ensure type safety when
// working with ChartIds in the application.
export type ChartId = (typeof ChartId)[keyof typeof ChartId];

/**
 * This object maps each ChartId to its metadata, by assigning each ChartId
 * an object with all the same properties. This allows for easy retrieval of
 * metadata for a given ChartId.
 * 
 * @type {ChartMetaById}
 * @property {ChartId.Psychrometric}
 *   @property {string} name - The name of the chart.
 *   @property {string} emptyMessage - The message to display when there is no data for the chart.
 *   @property {string} heightClass - The Tailwind CSS class for the height of the chart.
 * 
 */
export const chartMetaById: Record<
  ChartId,
  {
    name: string;
    emptyMessage: string;
    heightClass: string;
  }
> = {
  [ChartId.Psychrometric]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.Stress]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.Adaptive]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.AdaptiveDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.PmvDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.UtciDynamic]: {
    name: "Dynamic",
    emptyMessage: "No dynamic chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.HeatIndexRanges]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.Humidex]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
  [ChartId.WindChill]: {
    name: "Psychrometric",
    emptyMessage: "No psychrometric chart yet.",
    heightClass: "h-[480px] xl:h-[480px]",
  },
};
