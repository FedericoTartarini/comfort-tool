/**
 * Thermal Indices Chart Services
 * 
 * Provides visualization logic for common thermal indices, including the 
 * Heat Index, Humidex, and Wind Chill Index. Handles the creation of range 
 * charts and category-based heatmaps.
 */
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { CalculationSource } from "../../../models/calculationMetadata";
import type {
  PlotAnnotationDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
  ThermalIndicesChartInputsRequestDto,
} from "../../../models/comfortDtos";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { convertFieldValueFromSi, convertFieldValueToSi } from "../../units/index";
import { heat_index, humidex, wc } from "jsthermalcomfort";
import {
  getCompareInputs,
  roundValue,
  getHeatIndexCategory,
  getHumidexDiscomfort,
  getWindChillZone,
  HI_CAUTION,
  HI_EXTREME_CAUTION,
  HI_DANGER,
  HI_EXTREME_DANGER,
  HUMIDEX_NOTICEABLE,
  HUMIDEX_EVIDENT,
  HUMIDEX_INTENSE,
  HUMIDEX_DANGEROUS,
  HUMIDEX_STROKE_PROBABLE,
  WCI_FROSTBITE_2,
  WCI_FROSTBITE_10,
  WCI_FROSTBITE_30,
} from "../helpers";
import { type ComfortModel as ComfortModelType } from "../../../models/comfortModels";
import { inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import { buildInputScatterTrace, buildContourTrace } from "./plotlyBuilders";

/**
 * Builds a range chart for thermal indices (Heat Index, Humidex, Wind Chill), 
 * creating a 2D heatmap of the index over a specified range of two input variables.
 * @param payload - The inputs for the chart, including multiple calculation inputs.
 * @param cachedResultsByInput - A map of input IDs to their cached calculation results.
 * @param unitSystem - The unit system (SI or IP) for unit conversions.
 * @param config - Configuration object defining the chart's properties.
 * @returns PlotlyChartResponseDto - The chart data containing traces and layout.
 */
function buildThermalIndexRangeChart(
  payload: ThermalIndicesChartInputsRequestDto,
  cachedResultsByInput: any,
  unitSystem: UnitSystemType,
  config: {
    title: string;
    xKey: FieldKey;
    yKey: FieldKey;
    xRangeSi: { min: number; max: number };
    yRangeSi: { min: number; max: number };
    zMax: number;
    colorscale: any[][];
    hovertemplateContour: string;
    getHovertemplateScatter: (inputLabel: string, cached: any) => string;
    getScatterXSi: (payload: any) => number;
    getScatterYSi: (payload: any) => number;
    calculatePoint: (xSi: number, ySi: number) => { rangeValue: number; category: string };
  }
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;

  const xMeta = fieldMetaByKey[config.xKey];
  const yMeta = fieldMetaByKey[config.yKey];

  const xMin = convertFieldValueFromSi(config.xKey, config.xRangeSi.min, unitSystem);
  const xMax = convertFieldValueFromSi(config.xKey, config.xRangeSi.max, unitSystem);
  const yMin = convertFieldValueFromSi(config.yKey, config.yRangeSi.min, unitSystem);
  const yMax = convertFieldValueFromSi(config.yKey, config.yRangeSi.max, unitSystem);

  const xPoints = 50;
  const yPoints = 50;
  const xValues: number[] = [];
  const yValues: number[] = [];

  // Create the X and Y values for the range chart
  for (let i = 0; i < xPoints; i++) xValues.push(xMin + i * ((xMax - xMin) / (xPoints - 1)));
  for (let i = 0; i < yPoints; i++) yValues.push(yMin + i * ((yMax - yMin) / (yPoints - 1)));

  const zValues: number[][] = [];
  const textValues: string[][] = [];

  // Iterate over the Y-axis points to build each row of the grid
  for (let i = 0; i < yPoints; i++) {
    const row: number[] = [];
    const textRow: string[] = [];
    const ySi = convertFieldValueToSi(config.yKey, yValues[i], unitSystem);

    // For each X-axis point in the current row, calculate the thermal index value and category
    for (let j = 0; j < xPoints; j++) {
      const xSi = convertFieldValueToSi(config.xKey, xValues[j], unitSystem);
      try {
        const { rangeValue, category } = config.calculatePoint(xSi, ySi);
        row.push(rangeValue);
        textRow.push(category);
      } catch {
        row.push(NaN);
        textRow.push("Error");
      }
    }
    zValues.push(row);
    textValues.push(textRow);
  }

  // Add the heatmap trace
  const traces: PlotTraceDto[] = [
    buildContourTrace({
      name: config.title,
      x: xValues,
      y: yValues,
      z: zValues,
      text: textValues,
      colorscale: config.colorscale,
      zmin: 0,
      zmax: config.zMax,
      contours: { coloring: "heatmap", showlines: false },
      hovertemplate: config.hovertemplateContour,
      showscale: false,
      isZone: true,
    })
  ];

  // Add the scatter traces for each input
  inputs.forEach((input) => {
    const cached = cachedResultsByInput[input.inputId];
    const xVal = convertFieldValueFromSi(config.xKey, config.getScatterXSi(input.payload), unitSystem);
    const yVal = convertFieldValueFromSi(config.yKey, config.getScatterYSi(input.payload), unitSystem);
    
    traces.push(
      buildInputScatterTrace({
        inputId: input.inputId,
        x: xVal,
        y: yVal,
        showLegend: showInputLegend,
        hovertemplate: config.getHovertemplateScatter(inputDisplayMetaById[input.inputId].label, cached),
      })
    );
  });

  // Return the chart data
  return {
    traces,
    layout: {
      title: config.title,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      showlegend: showInputLegend,
      margin: { l: 60, r: 24, t: 60, b: 60 },
      xaxis: { title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`, range: [xMin, xMax] },
      yaxis: { title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`, range: [yMin, yMax] }
    },
    annotations: [],
    source: CalculationSource.JsThermalComfort
  };
}

/**
 * Builds the Heat Index Chart.
 * @param payload - The inputs for the chart
 * @param cachedResultsByInput - The cached results for the chart
 * @param unitSystem - The unit system to use
 * @returns PlotlyChartResponseDto - The chart data
 */
export function buildHeatIndexRangesChart(
  payload: ThermalIndicesChartInputsRequestDto,
  cachedResultsByInput: any = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
): PlotlyChartResponseDto {
  return buildThermalIndexRangeChart(payload, cachedResultsByInput, unitSystem, {
    title: "Heat Index Ranges",
    xKey: FieldKey.RelativeHumidity,
    yKey: FieldKey.DryBulbTemperature,
    xRangeSi: { min: 0, max: 100 },
    yRangeSi: { min: 20, max: 50 },
    zMax: 4,
    colorscale: [
      [0, "#e2e8f0"], [0.2, "#e2e8f0"], // Safe
      [0.2, "#fef08a"], [0.4, "#fef08a"], // Caution
      [0.4, "#fde047"], [0.6, "#fde047"], // Extreme Caution
      [0.6, "#f97316"], [0.8, "#f97316"], // Danger
      [0.8, "#dc2626"], [1, "#dc2626"] // Extreme Danger
    ],
    hovertemplateContour: "Category: %{text}<extra></extra>",
    getHovertemplateScatter: (label, cached) => `${label}<br>RH: %{x:.1f}%<br>Air Temp: %{y:.1f}°<br>Heat Index: ${roundValue(cached?.hi, 1)}°<extra></extra>`,
    getScatterXSi: (p) => p.rh,
    getScatterYSi: (p) => p.tdb,
    calculatePoint: (xSi, ySi) => {
      const result = heat_index(ySi, xSi, { round: true, units: "SI" });
      const hi = result.hi;
      let rangeValue = 0;
      if (hi >= HI_EXTREME_DANGER) rangeValue = 4;
      else if (hi >= HI_DANGER) rangeValue = 3;
      else if (hi >= HI_EXTREME_CAUTION) rangeValue = 2;
      else if (hi >= HI_CAUTION) rangeValue = 1;
      return { rangeValue, category: getHeatIndexCategory(hi) };
    }
  });
}

/**
 * Builds the Humidex Chart.
 * @param payload - The inputs for the chart
 * @param cachedResultsByInput - The cached results for the chart
 * @param unitSystem - The unit system to use
 * @returns PlotlyChartResponseDto - The chart data
 */
export function buildHumidexChart(
  payload: ThermalIndicesChartInputsRequestDto,
  cachedResultsByInput: any = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
): PlotlyChartResponseDto {
  return buildThermalIndexRangeChart(payload, cachedResultsByInput, unitSystem, {
    title: "Humidex Discomfort",
    xKey: FieldKey.RelativeHumidity,
    yKey: FieldKey.DryBulbTemperature,
    xRangeSi: { min: 0, max: 100 },
    yRangeSi: { min: 20, max: 50 },
    zMax: 5,
    colorscale: [
      [0, "#e2e8f0"], [0.166, "#e2e8f0"], // Little/None
      [0.166, "#fef08a"], [0.333, "#fef08a"], // Noticeable
      [0.333, "#fde047"], [0.5, "#fde047"], // Evident
      [0.5, "#facc15"], [0.666, "#facc15"], // Intense
      [0.666, "#f97316"], [0.833, "#f97316"], // Dangerous
      [0.833, "#dc2626"], [1, "#dc2626"] // Stroke Probable
    ],
    hovertemplateContour: "Discomfort: %{text}<extra></extra>",
    getHovertemplateScatter: (label, cached) => `${label}<br>RH: %{x:.1f}%<br>Air Temp: %{y:.1f}°<br>Humidex: ${roundValue(cached?.humidex, 1)}<extra></extra>`,
    getScatterXSi: (p) => p.rh,
    getScatterYSi: (p) => p.tdb,
    calculatePoint: (xSi, ySi) => {
      const result = humidex(ySi, xSi, { round: true });
      const h = result.humidex;
      let rangeValue = 0;
      if (h >= HUMIDEX_STROKE_PROBABLE) rangeValue = 5;
      else if (h >= HUMIDEX_DANGEROUS) rangeValue = 4;
      else if (h >= HUMIDEX_INTENSE) rangeValue = 3;
      else if (h >= HUMIDEX_EVIDENT) rangeValue = 2;
      else if (h >= HUMIDEX_NOTICEABLE) rangeValue = 1;
      return { rangeValue, category: getHumidexDiscomfort(h) };
    }
  });
}

/**
 * Builds the Wind Chill Chart.
 * @param payload - The inputs for the chart
 * @param cachedResultsByInput - The cached results for the chart
 * @param unitSystem - The unit system to use
 * @returns PlotlyChartResponseDto - The chart data
 */
export function buildWindChillChart(
  payload: ThermalIndicesChartInputsRequestDto,
  cachedResultsByInput: any = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
): PlotlyChartResponseDto {
  return buildThermalIndexRangeChart(payload, cachedResultsByInput, unitSystem, {
    title: "Wind Chill Frostbite Risk",
    xKey: FieldKey.RelativeAirSpeed,
    yKey: FieldKey.DryBulbTemperature,
    xRangeSi: { min: 1, max: 20 },
    yRangeSi: { min: -45, max: 0 },
    zMax: 3,
    colorscale: [
      [0, "#e0f2fe"], [0.25, "#e0f2fe"], // Safe
      [0.25, "#64b5f5"], [0.5, "#64b5f5"], // 30 min
      [0.5, "#5c6bc0"], [0.75, "#5c6bc0"], // 10 min
      [0.75, "#8e24aa"], [1, "#8e24aa"] // 2 min
    ],
    hovertemplateContour: "Frostbite Risk: %{text}<extra></extra>",
    getHovertemplateScatter: (label, cached) => `${label}<br>Wind Speed: %{x:.2f}<br>Air Temp: %{y:.1f}°<br>Wind Chill: ${roundValue(cached?.wciTemp, 1)}°<extra></extra>`,
    getScatterXSi: (p) => p.v || 0,
    getScatterYSi: (p) => p.tdb,
    calculatePoint: (xSi, ySi) => {
      const result = wc(ySi, xSi, { round: true });
      const wci = result.wci;
      let rangeValue = 0;
      if (wci >= WCI_FROSTBITE_2) rangeValue = 3;
      else if (wci >= WCI_FROSTBITE_10) rangeValue = 2;
      else if (wci >= WCI_FROSTBITE_30) rangeValue = 1;
      return { rangeValue, category: getWindChillZone(wci) };
    }
  });
}

/**
 * Builds a dynamic 2D contour chart for the Thermal Indices models based on user-selected axes.
 *
 * @param modelId The ComfortModel ID (HeatIndex, Humidex, or WindChill).
 * @param payload The base inputs to use for non-dynamic axes.
 * @param cachedResultsByInput Cached calculations for the scatter points.
 * @param unitSystem The unit system to use for display.
 * @param dynamicXAxis The field key representing the X axis.
 * @param dynamicYAxis The field key representing the Y axis.
 */
export function buildThermalIndicesDynamicChart(
  modelId: ComfortModelType,
  payload: ThermalIndicesChartInputsRequestDto,
  cachedResultsByInput: any = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
  dynamicXAxis?: FieldKey,
  dynamicYAxis?: FieldKey,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;

  if (!dynamicXAxis || !dynamicYAxis || dynamicXAxis === dynamicYAxis) {
    return {
      traces: [],
      layout: {
        title: "Invalid Axes",
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        showlegend: false,
        margin: { l: 60, r: 24, t: 60, b: 60 },
        xaxis: {},
        yaxis: {},
      },
      annotations: [],
      source: CalculationSource.JsThermalComfort,
    };
  }

  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];

  // Define ranges based on model and axis type
  const getRange = (key: FieldKey) => {
    if (key === FieldKey.DryBulbTemperature) {
      if (modelId === "WIND_CHILL") return { min: -45, max: 0 };
      return { min: 20, max: 50 };
    }
    if (key === FieldKey.RelativeHumidity) return { min: 0, max: 100 };
    if (key === FieldKey.RelativeAirSpeed || key === FieldKey.WindSpeed) return { min: 1, max: 20 };
    return { min: 0, max: 100 };
  };

  const xRangeSi = getRange(dynamicXAxis);
  const yRangeSi = getRange(dynamicYAxis);

  const xMin = convertFieldValueFromSi(dynamicXAxis, xRangeSi.min, unitSystem);
  const xMax = convertFieldValueFromSi(dynamicXAxis, xRangeSi.max, unitSystem);
  const yMin = convertFieldValueFromSi(dynamicYAxis, yRangeSi.min, unitSystem);
  const yMax = convertFieldValueFromSi(dynamicYAxis, yRangeSi.max, unitSystem);

  const xPoints = 50;
  const yPoints = 50;
  const xValues: number[] = [];
  const yValues: number[] = [];

  for (let i = 0; i < xPoints; i++) xValues.push(xMin + i * ((xMax - xMin) / (xPoints - 1)));
  for (let i = 0; i < yPoints; i++) yValues.push(yMin + i * ((yMax - yMin) / (yPoints - 1)));

  const zValues: number[][] = [];
  const textValues: string[][] = [];

  for (let i = 0; i < yPoints; i++) {
    const row: number[] = [];
    const textRow: string[] = [];
    const ySi = convertFieldValueToSi(dynamicYAxis, yValues[i], unitSystem);

    for (let j = 0; j < xPoints; j++) {
      const xSi = convertFieldValueToSi(dynamicXAxis, xValues[j], unitSystem);

      // Build payload for calculation
      const calcPayload: any = { units: "SI" as const };
      if (dynamicXAxis === FieldKey.DryBulbTemperature) calcPayload.tdb = xSi;
      if (dynamicYAxis === FieldKey.DryBulbTemperature) calcPayload.tdb = ySi;
      if (dynamicXAxis === FieldKey.RelativeHumidity) calcPayload.rh = xSi;
      if (dynamicYAxis === FieldKey.RelativeHumidity) calcPayload.rh = ySi;
      if (dynamicXAxis === FieldKey.RelativeAirSpeed || dynamicXAxis === FieldKey.WindSpeed) calcPayload.v = xSi;
      if (dynamicYAxis === FieldKey.RelativeAirSpeed || dynamicYAxis === FieldKey.WindSpeed) calcPayload.v = ySi;

      // Fill in defaults for missing fields (though for these models there shouldn't be any "missing" dynamic axes if selected)
      if (calcPayload.tdb === undefined) calcPayload.tdb = convertFieldValueToSi(FieldKey.DryBulbTemperature, convertFieldValueFromSi(FieldKey.DryBulbTemperature, 25, UnitSystem.SI), unitSystem);
      if (calcPayload.rh === undefined) calcPayload.rh = 50;
      if (calcPayload.v === undefined) calcPayload.v = 0.1;

      try {
        let rangeValue = 0;
        let category = "";

        if (modelId === "HEAT_INDEX") {
          const res = heat_index(calcPayload.tdb, calcPayload.rh, { round: true, units: "SI" });
          const hi = res.hi;
          if (hi >= HI_EXTREME_DANGER) rangeValue = 4;
          else if (hi >= HI_DANGER) rangeValue = 3;
          else if (hi >= HI_EXTREME_CAUTION) rangeValue = 2;
          else if (hi >= HI_CAUTION) rangeValue = 1;
          category = getHeatIndexCategory(hi);
        } else if (modelId === "HUMIDEX") {
          const res = humidex(calcPayload.tdb, calcPayload.rh, { round: true });
          const h = res.humidex;
          if (h >= HUMIDEX_STROKE_PROBABLE) rangeValue = 5;
          else if (h >= HUMIDEX_DANGEROUS) rangeValue = 4;
          else if (h >= HUMIDEX_INTENSE) rangeValue = 3;
          else if (h >= HUMIDEX_EVIDENT) rangeValue = 2;
          else if (h >= HUMIDEX_NOTICEABLE) rangeValue = 1;
          category = getHumidexDiscomfort(h);
        } else if (modelId === "WIND_CHILL") {
          const res = wc(calcPayload.tdb, calcPayload.v, { round: true });
          const wci = res.wci;
          if (wci >= WCI_FROSTBITE_2) rangeValue = 3;
          else if (wci >= WCI_FROSTBITE_10) rangeValue = 2;
          else if (wci >= WCI_FROSTBITE_30) rangeValue = 1;
          category = getWindChillZone(wci);
        }

        row.push(rangeValue);
        textRow.push(category);
      } catch {
        row.push(NaN);
        textRow.push("Error");
      }
    }
    zValues.push(row);
    textValues.push(textRow);
  }

  const colorscales: Record<string, any[][]> = {
    "HEAT_INDEX": [
      [0, "#e2e8f0"], [0.2, "#e2e8f0"],
      [0.2, "#fef08a"], [0.4, "#fef08a"],
      [0.4, "#fde047"], [0.6, "#fde047"],
      [0.6, "#f97316"], [0.8, "#f97316"],
      [0.8, "#dc2626"], [1, "#dc2626"]
    ],
    "HUMIDEX": [
      [0, "#e2e8f0"], [0.166, "#e2e8f0"],
      [0.166, "#fef08a"], [0.333, "#fef08a"],
      [0.333, "#fde047"], [0.5, "#fde047"],
      [0.5, "#facc15"], [0.666, "#facc15"],
      [0.666, "#f97316"], [0.833, "#f97316"],
      [0.833, "#dc2626"], [1, "#dc2626"]
    ],
    "WIND_CHILL": [
      [0, "#e0f2fe"], [0.25, "#e0f2fe"],
      [0.25, "#64b5f5"], [0.5, "#64b5f5"],
      [0.5, "#5c6bc0"], [0.75, "#5c6bc0"],
      [0.75, "#8e24aa"], [1, "#8e24aa"]
    ]
  };

  const zMaxs: Record<string, number> = { "HEAT_INDEX": 4, "HUMIDEX": 5, "WIND_CHILL": 3 };

  const traces: PlotTraceDto[] = [
    buildContourTrace({
      name: modelId.replace("_", " "),
      x: xValues,
      y: yValues,
      z: zValues,
      text: textValues,
      colorscale: colorscales[modelId as any] || [],
      zmin: 0,
      zmax: zMaxs[modelId as any] || 1,
      contours: { coloring: "heatmap", showlines: false },
      hovertemplate: "%{text}<extra></extra>",
      showscale: false,
      isZone: true,
    })
  ];

  inputs.forEach((input) => {
    const getVal = (key: FieldKey) => {
      if (key === FieldKey.RelativeAirSpeed || key === FieldKey.WindSpeed) return input.payload.v || 0;
      return (input.payload as any)[key] || 0;
    };

    const xVal = convertFieldValueFromSi(dynamicXAxis, getVal(dynamicXAxis), unitSystem);
    const yVal = convertFieldValueFromSi(dynamicYAxis, getVal(dynamicYAxis), unitSystem);
    const cached = cachedResultsByInput[input.inputId];
    
    let indexValue = "";
    if (modelId === "HEAT_INDEX") indexValue = `HI: ${roundValue(cached?.hi, 1)}°`;
    else if (modelId === "HUMIDEX") indexValue = `Humidex: ${roundValue(cached?.humidex, 1)}`;
    else if (modelId === "WIND_CHILL") indexValue = `WC: ${roundValue(cached?.wciTemp, 1)}°`;

    traces.push(
      buildInputScatterTrace({
        inputId: input.inputId,
        x: xVal,
        y: yVal,
        showLegend: showInputLegend,
        hovertemplate: `${inputDisplayMetaById[input.inputId].label}<br>${xMeta.label}: %{x:.1f}<br>${yMeta.label}: %{y:.1f}<br>${indexValue}<extra></extra>`,
      })
    );
  });

  return {
    traces,
    layout: {
      title: `Dynamic ${modelId.replace("_", " ").toLowerCase()}`,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      showlegend: showInputLegend,
      margin: { l: 60, r: 24, t: 60, b: 60 },
      xaxis: { title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`, range: [xMin, xMax] },
      yaxis: { title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`, range: [yMin, yMax] }
    },
    annotations: [],
    source: CalculationSource.JsThermalComfort
  };
}
