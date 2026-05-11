/**
 * UTCI Chart Services
 * 
 * Provides functions for building UTCI (Universal Thermal Climate Index) charts.
 * Includes 1D stress category plots and 2D dynamic heatmaps characterizing 
 * thermal stress across varying environmental conditions.
 */

import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { CalculationSource } from "../../../models/calculationMetadata";
import {
  utciStressBands,
  utciStressShortLabelByCategory,
  getCompareInputs,
  roundValue,
  formatSignedTemperature,
  type UtciChartResultsByInput,
  getUtciStressLabel,
} from "../helpers";
import type {
  PlotAnnotationDto,
  PlotlyChartResponseDto,
  PlotTraceDto,
  UtciRequestDto,
  UtciResponseDto,
  UtciChartInputsRequestDto,
  UtciChartSourceDto,
} from "../../../models/comfortDtos";
import { InputId as InputIdType } from "../../../models/inputSlots";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import { convertFieldValueFromSi, convertFieldValueToSi } from "../../units";
import { calculateUtci } from "../utci";
import {
  getPaddedAxisRange,
} from "../helpers";
import { inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import { buildInputAnnotation, buildInputScatterTrace, buildRectangleSelectionShape, buildTextAnnotation, buildContourTrace } from "./plotlyBuilders";
import { utci, t_o } from "jsthermalcomfort";
import { mapping as utciMapping } from "jsthermalcomfort/src/models/utci";

const UTCI_MIN = -50;
const UTCI_MAX = 55;
const UTCI_RANGE = UTCI_MAX - UTCI_MIN;

const UTCI_BOUNDARIES = [-50, -40, -27, -13, 0, 9, 26, 32, 38, 46, 55];

/**
 * Maps a continuous UTCI temperature value to a monotonic "Z" scale (0-10)
 * where each integer boundary (1, 2, ..., 9) corresponds exactly to a 
 * physical UTCI stress category boundary. This ensures that Plotly's 
 * linear interpolation for contours remains physically accurate.
 */
function mapUtciToZ(utci: number): number {
  if (utci <= UTCI_BOUNDARIES[0]) return 0;
  const lastIdx = UTCI_BOUNDARIES.length - 1;
  if (utci >= UTCI_BOUNDARIES[lastIdx]) return lastIdx;

  for (let i = 0; i < lastIdx; i++) {
    const min = UTCI_BOUNDARIES[i];
    const max = UTCI_BOUNDARIES[i + 1];
    if (utci >= min && utci < max) {
      return i + (utci - min) / (max - min);
    }
  }
  return lastIdx;
}

const UTCI_COLORSCALE = utciStressBands.reduce((acc, band, index, array) => {
  const step = 1 / array.length;
  acc.push([index * step, band.color]);
  acc.push([(index + 1) * step, band.color]);
  return acc;
}, [] as [number, string][]);

const UTCI_LEVELS = utciStressBands.slice(0, -1).map((band) => band.maximum);

const UTCI_CONTOURS = {
  start: 1,
  end: 9,
  size: 1,
  type: "levels",
  coloring: "fill",
  showlines: true,
  smoothing: 1.3,
  line: { width: 1, color: "#333333" },
};

const UTCI_COLORBAR = {
  title: {
    text: "Stress Category",
    font: { size: 12 },
    side: "top"
  },
  tickvals: [-45, -33.5, -20, -6.5, 4.5, 17.5, 29, 35, 42, 50.5],
  ticktext: [
    "Extreme Cold",
    "V. Strong Cold",
    "Strong Cold",
    "Moderate Cold",
    "Slight Cold",
    "No Stress",
    "Moderate Heat",
    "Strong Heat",
    "V. Strong Heat",
    "Extreme Heat"
  ],
  thickness: 15,
  len: 0.8,
  y: 0.5,
  yanchor: "middle"
} as const;

/**
 * Retrieves or computes the UTCI result for a given input.
 *
 * @param inputId The ID of the input to look up.
 * @param payload the UTCI request payload.
 * @param cachedResultsByInput A dictionary of already completed calculation outputs.
 * @returns The resolved UTCI evaluation wrapper.
 */
function getUtciResultForInput(
  inputId,
  payload: UtciRequestDto,
  cachedResultsByInput: UtciChartResultsByInput,
): UtciResponseDto {
  // Return cached result if available, otherwise calculate new result.
  return cachedResultsByInput[inputId] ?? calculateUtci(payload);
}

/**
 * Displays 1-dimensional horizontal plots characterizing UTCI categorized stress scores.
 * The Y position scales multiple inputs distinctly for overlapping values.
 *
 * @param payload The UTCI chart's inputs request data transfer object (DTO).
 * @param cachedResultsByInput A dictionary of already computed UTCI results for each input.
 * @param unitSystem Standard SI or IP visual mappings context.
 * @returns Generated plotly traces and layout components mapping the stress charts.
 */
export function buildUtciStressChart(
  payload: UtciChartInputsRequestDto,
  cachedResultsByInput: UtciChartResultsByInput = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
  baselineInputId?: string,
): PlotlyChartResponseDto {
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;
  const markerPositions = inputs.length > 1 ? [0.78, 0.5, 0.22] : [0.5];
  const annotations: PlotAnnotationDto[] = [];
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  const stressRange: [number, number] = [
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, -50, unitSystem),
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, 55, unitSystem),
  ];

  // UTCI chart traces.
  const traces: PlotTraceDto[] = [
    buildContourTrace({
      name: "Legend",
      x: UTCI_BOUNDARIES.map(val => convertFieldValueFromSi(FieldKey.DryBulbTemperature, val, unitSystem)),
      y: Array.from({ length: 50 }, (_, i) => i / 49),
      z: Array.from({ length: 50 }, () => UTCI_BOUNDARIES.map((_, i) => i)),
      text: Array.from({ length: 50 }, () => 
        utciStressBands.map(b => b.label).concat(utciStressBands[utciStressBands.length - 1].label)
      ),
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_CONTOURS,
      showscale: false,
      hovertemplate: `UTCI: %{x:.1f} ${temperatureDisplayUnits}<br><b>Stress Category: %{text}</b><extra></extra>`,
      zmin: 0,
      zmax: 10,
      opacity: 0.75,
      isZone: true,
    })
  ];

  inputs.forEach(({ inputId, payload: inputPayload }, index) => {
    // Get UTCI result for the current input.
    const result = getUtciResultForInput(inputId, inputPayload, cachedResultsByInput);
    const inputLabel = inputDisplayMetaById[inputId].label;
    const yPosition = markerPositions[index];
    const displayUtci = roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem));

    traces.push(buildInputScatterTrace({
      inputId,
      x: displayUtci,
      y: yPosition,
      showLegend: showInputLegend,
      hovertemplate: `${inputLabel}<br>UTCI: %{x:.1f} ${temperatureDisplayUnits}<br><b>Stress Category: ${getUtciStressLabel(result.stressCategory)}</b><extra></extra>`,
      markerSize: 14,
    }));
  });

  // Add text labels for the stress category bands.
  utciStressBands.forEach((band, index) => {
    annotations.push(buildTextAnnotation({
      // Center the label horizontally within the band.
      x: (
        // Minimum UTCI Temperature.
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, band.minimum, unitSystem) +
        // Maximum UTCI Temperature.
        convertFieldValueFromSi(FieldKey.DryBulbTemperature, band.maximum, unitSystem)
      ) / 2,
      // Alternate vertical positions for labels to avoid crowding.
      y: index % 2 === 0 ? 0.05 : 0.16,
      // Text showing the stress category.
      text: utciStressShortLabelByCategory[band.category],
    }));
  });

  // Return the chart traces and layout.
  return {
    traces,
    layout: {
      title: "UTCI stress category",
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      showlegend: showInputLegend,
      margin: { l: 56, r: 24, t: 48, b: 80 },
      xaxis: {
        title: `UTCI (${temperatureDisplayUnits})`,
        range: stressRange,
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: "",
        range: [0, 1],
        showticklabels: false,
        gridcolor: "#ffffff",
      },
      shapes: [],
      legend: { orientation: "h", x: 0, y: 1.08 },
      height: 480,
    },
    // Annotations.
    annotations,
    // The source of the calculation, indicating it was generated directly in the browser.
    source: CalculationSource.FrontendGenerated,
  };
}


/**
 * Builds a dynamic 2D contour chart for the UTCI model based on two user-selected input axes.
 *
 * @param payload The base inputs to use for the non-dynamic axes.
 * @param cachedResultsByInput Cached calculations for the scatter points.
 * @param unitSystem The unit system to use for display.
 * @param dynamicXAxis The field key representing the X axis.
 * @param dynamicYAxis The field key representing the Y axis.
 */
export function buildUtciDynamicChart(
  payload: UtciChartInputsRequestDto,
  cachedResultsByInput: UtciChartResultsByInput = {},
  unitSystem: UnitSystemType = UnitSystem.SI,
  dynamicXAxis?: FieldKey,
  dynamicYAxis?: FieldKey,
  baselineInputId?: string,
): PlotlyChartResponseDto {
  // Get inputs for the chart.
  const inputs = getCompareInputs(payload.inputs);
  // Show legend if more than one input.
  const showInputLegend = inputs.length > 1;

  // Check for invalid axes selection.
  if (!dynamicXAxis || !dynamicYAxis || dynamicXAxis === dynamicYAxis) {
    return {
      traces: [],
      layout: {
        title: "Invalid Axes Selection",
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#f8fafc",
        showlegend: false,
        margin: { l: 64, r: 24, t: 48, b: 64 },
        xaxis: {},
        yaxis: {},
      },
      annotations: [],
      source: CalculationSource.FrontendGenerated,
    };
  }

  // Get active input payload.
  const activeInputPayload = (payload.inputs[baselineInputId as any] || inputs[0]?.payload);

  // Get field metadata for the dynamic axes.
  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];

  // Calculate min/max for the axes.
  const xMin = convertFieldValueFromSi(dynamicXAxis, xMeta.minValue, unitSystem);
  const xMax = convertFieldValueFromSi(dynamicXAxis, xMeta.maxValue, unitSystem);
  const yMin = convertFieldValueFromSi(dynamicYAxis, yMeta.minValue, unitSystem);
  const yMax = convertFieldValueFromSi(dynamicYAxis, yMeta.maxValue, unitSystem);
  
  // Set the number of points for the axes to ensure perfectly smooth contours.
  const xPoints = 300;
  const yPoints = 300;
  const xValues: number[] = [];
  const yValues: number[] = [];
  
  // Generate x values.
  for (let i = 0; i < xPoints; i++) {
    xValues.push(xMin + (xMax - xMin) * (i / (xPoints - 1)));
  }
  // Generate y values.
  for (let i = 0; i < yPoints; i++) {
    yValues.push(yMin + (yMax - yMin) * (i / (yPoints - 1)));
  }

  const zValues: number[][] = [];
  const textValues: string[][] = [];
  const customValues: number[][] = [];

  if (activeInputPayload) {
    for (let i = 0; i < yPoints; i++) {
      const row: number[] = [];
      const textRow: string[] = [];
      const customRow: number[] = [];

      const ySi = convertFieldValueToSi(dynamicYAxis, yValues[i], unitSystem);

      for (let j = 0; j < xPoints; j++) {
        const xSi = convertFieldValueToSi(dynamicXAxis, xValues[j], unitSystem);

        // Start with the baseline values from the active input.
        let tdb = activeInputPayload.tdb;
        let tr = activeInputPayload.tr;
        let v = activeInputPayload.v;
        let rh = activeInputPayload.rh;
        
        // Update parameters based on the selected dynamic axes
        const updateParams = (key: string, val: number) => {
          if (key === FieldKey.DryBulbTemperature) { tdb = val; }
          else if (key === FieldKey.MeanRadiantTemperature) { tr = val; }
          else if (key === FieldKey.OperativeTemperature) { tdb = val; tr = val; }
          else if (key === FieldKey.WindSpeed || key === FieldKey.RelativeAirSpeed) { v = val; }
          else if (key === FieldKey.RelativeHumidity) { rh = val; }
        };

        updateParams(dynamicXAxis, xSi);
        updateParams(dynamicYAxis, ySi);

        try {
          // Calculate UTCI using the resolved parameters.
          const result = utci(tdb, tr, v, rh, "SI", true, false);
          
          // Map the stress category to a display-ready label.
          const categoryName = String(result.stress_category);
          // Get the short label for the category name. If the name is not in the map, use the category name.
          const shortLabel = utciStressShortLabelByCategory[categoryName as any] ?? categoryName;
          
          // Push UTCI value to row if it exists.
          if (typeof result === "object" && typeof result.utci === "number") {
            // Map the actual UTCI value to our normalized monotonic Z-scale for the contour trace.
            // This ensures smooth separator lines align perfectly with the physical model boundaries.
            row.push(mapUtciToZ(result.utci));
            textRow.push(shortLabel);
            customRow.push(convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem));
          } else {
            // Push NaN and empty string if UTCI doesn't exist.
            row.push(NaN);
            textRow.push("");
            customRow.push(NaN);
          }
        // Catch errors.
        } catch (e) {
          row.push(NaN);
          textRow.push("");
          customRow.push(NaN);
        }
      }
      // Push row to z values.
      zValues.push(row);
      textValues.push(textRow);
      customValues.push(customRow);
    }
  }

  const traces: PlotTraceDto[] = [];

  // Push the contour trace if z values exist.
  if (zValues.length > 0) {
    traces.push(buildContourTrace({
      name: "UTCI Zones",
      x: xValues,
      y: yValues,
      z: zValues,
      text: textValues,
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_CONTOURS,
      showscale: false,
      zmin: 0,
      zmax: 10,
      hovertemplate: `${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}<br><b>Zone: %{text}</b><br>UTCI: %{customdata:.1f} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}<extra></extra>`,
      customdata: customValues,
      opacity: 0.75,
      isZone: true,
    }));
  }

  // Add input scatter traces.
  inputs.forEach(({ inputId, payload: inputPayload }) => {
    const getFieldValue = (key: string): number => {
      if (key === FieldKey.DryBulbTemperature) return inputPayload.tdb;
      if (key === FieldKey.MeanRadiantTemperature) return inputPayload.tr;
      if (key === FieldKey.WindSpeed || key === FieldKey.RelativeAirSpeed) return inputPayload.v;
      if (key === FieldKey.RelativeHumidity) return inputPayload.rh;
      if (key === FieldKey.OperativeTemperature) {
        return t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, "ISO");
      }
      return 0;
    };

    let inputX = getFieldValue(dynamicXAxis as string);
    let inputY = getFieldValue(dynamicYAxis as string);
    
    // Convert input values to SI units.
    inputX = convertFieldValueFromSi(dynamicXAxis as FieldKey, inputX, unitSystem);
    inputY = convertFieldValueFromSi(dynamicYAxis as FieldKey, inputY, unitSystem);

    // Calculate UTCI and Stress Category for the scatter dot.
    let utciText = "";
    try {
      const utciRes = utci(inputPayload.tdb, inputPayload.tr, inputPayload.v, inputPayload.rh, "SI", true, false);
      const categoryName = String(utciRes.stress_category);
      const shortLabel = utciStressShortLabelByCategory[categoryName as any] ?? categoryName;
      const displayUtciVal = convertFieldValueFromSi(FieldKey.DryBulbTemperature, utciRes.utci, unitSystem);
      utciText = `<br><b>Zone: ${shortLabel}</b><br>UTCI: ${roundValue(displayUtciVal, 1)} ${fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem]}`;
    } catch {
      // Ignore errors.
    }

    // Push the input scatter trace if the values exist.
    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(inputX),
      y: roundValue(inputY),
      showLegend: showInputLegend,
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}${utciText}<extra></extra>`,
    }));
  });

  // Return the traces and layout.
  return {
    traces,
    layout: {
      title: `UTCI Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      showlegend: showInputLegend,
      margin: { l: 64, r: 24, t: 48, b: 64 },
      xaxis: {
        title: `${xMeta.label} (${xMeta.displayUnits[unitSystem]})`,
        range: [xMin, xMax],
        showgrid: false,
        zeroline: false,
      },
      yaxis: {
        title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`,
        range: [yMin, yMax],
        showgrid: false,
        zeroline: false,
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}
