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
} from "../../../models/utciStress";
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
  formatSignedTemperature,
  getPaddedAxisRange,
  getCompareInputs,
  roundValue,
  type UtciChartResultsByInput,
} from "../helpers";
import { inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import { buildInputAnnotation, buildInputScatterTrace, buildRectangleSelectionShape, buildTextAnnotation, buildContourTrace } from "./plotlyBuilders";
import { utci, t_o } from "jsthermalcomfort";
import { mapping as utciMapping } from "jsthermalcomfort/src/models/utci";

const UTCI_MIN = -50;
const UTCI_MAX = 55;
const UTCI_RANGE = UTCI_MAX - UTCI_MIN;

function n(val: number) {
  return (val - UTCI_MIN) / UTCI_RANGE;
}

const UTCI_COLORSCALE = [
  [0, "#0f172a"], [n(-40), "#0f172a"], // Extreme cold
  [n(-40), "#1d4ed8"], [n(-27), "#1d4ed8"], // Very strong cold
  [n(-27), "#2563eb"], [n(-13), "#2563eb"], // Strong cold
  [n(-13), "#3b82f6"], [n(0), "#3b82f6"], // Moderate cold
  [n(0), "#7dd3fc"], [n(9), "#7dd3fc"], // Slight cold
  [n(9), "#34d399"], [n(26), "#34d399"], // No thermal stress
  [n(26), "#fbbf24"], [n(32), "#fbbf24"], // Moderate heat
  [n(32), "#fb923c"], [n(38), "#fb923c"], // Strong heat
  [n(38), "#f97316"], [n(46), "#f97316"], // Very strong heat
  [n(46), "#dc2626"], [1, "#dc2626"], // Extreme heat
];

const UTCI_CONTOURS = {
  coloring: "heatmap",
  showlines: false,
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
  // Get the inputs for the chart.
  const inputs = getCompareInputs(payload.inputs);
  // Show input legend if there are multiple inputs.
  const showInputLegend = inputs.length > 1;
  // Vertical positions for markers to avoid overlap.
  const markerPositions = inputs.length > 1 ? [0.78, 0.5, 0.22] : [0.5];
  // UTCI chart annotations.
  const annotations: PlotAnnotationDto[] = [];
  // Get temperature display units.
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  // Default UTCI range in display units.
  const stressRange: [number, number] = [
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, -50, unitSystem),
    convertFieldValueFromSi(FieldKey.DryBulbTemperature, 55, unitSystem),
  ];

  // UTCI chart traces.
  const traces: PlotTraceDto[] = [
    buildContourTrace({
      name: "Legend",
      x: [stressRange[0], stressRange[1]],
      y: [0, 1],
      z: [[UTCI_MIN, UTCI_MAX], [UTCI_MIN, UTCI_MAX]],
      colorscale: UTCI_COLORSCALE,
      contours: UTCI_CONTOURS,
      showscale: false,
      hovertemplate: "<extra></extra>",
      zmin: UTCI_MIN,
      zmax: UTCI_MAX,
      opacity: 0.75,
      isZone: true,
    })
  ];

  // Create data points and labels for each input.
  inputs.forEach(({ inputId, payload: inputPayload }, index) => {
    // Get UTCI result for the current input.
    const result = getUtciResultForInput(inputId, inputPayload, cachedResultsByInput);
    const inputLabel = inputDisplayMetaById[inputId].label;
    const yPosition = markerPositions[index];
    // Convert calculated UTCI (SI) to display units.
    const displayUtci = roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, result.utci, unitSystem));

    traces.push(buildInputScatterTrace({
      inputId,
      x: displayUtci,
      y: yPosition,
      showLegend: showInputLegend,
      hovertemplate: `${inputLabel}<br>UTCI %{x:.1f} ${temperatureDisplayUnits}<br>${result.stressCategory}<extra></extra>`,
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
        gridcolor: "#e2e8f0",
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
  
  // Set the number of points for the axes.
  const xPoints = 50;
  const yPoints = 50;
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

  // Initialize z values and text values.
  const zValues: number[][] = [];
  const textValues: string[][] = [];

  // Check if active input payload exists.
  if (activeInputPayload) {
    // Iterate through y values.
    for (let i = 0; i < yPoints; i++) {
      const row: number[] = [];
      const textRow: string[] = [];

      // Convert the current y-axis display value to its SI equivalent.
      const ySi = convertFieldValueToSi(dynamicYAxis, yValues[i], unitSystem);

      // Iterate through x values.
      for (let j = 0; j < xPoints; j++) {
        // Convert the current x-axis display value to its SI equivalent.
        const xSi = convertFieldValueToSi(dynamicXAxis, xValues[j], unitSystem);

        // Start with the baseline values from the active input.
        let tdb = activeInputPayload.tdb;
        let tr = activeInputPayload.tr;
        let v = activeInputPayload.v;
        let rh = activeInputPayload.rh;

        // Override values based on the selected dynamic axes.
        // Apply X-axis value if the dynamic X-axis is set.
        if (dynamicXAxis === FieldKey.DryBulbTemperature) { tdb = xSi; }
        else if (dynamicXAxis === FieldKey.MeanRadiantTemperature) { tr = xSi; }
        else if (dynamicXAxis === FieldKey.OperativeTemperature) { tdb = xSi; tr = xSi; }
        else if (dynamicXAxis === FieldKey.WindSpeed) { v = xSi; }
        else if (dynamicXAxis === FieldKey.RelativeHumidity) { rh = xSi; }

        // Apply Y-axis value if the dynamic Y-axis is set.
        if (dynamicYAxis === FieldKey.DryBulbTemperature) { tdb = ySi; }
        else if (dynamicYAxis === FieldKey.MeanRadiantTemperature) { tr = ySi; }
        else if (dynamicYAxis === FieldKey.OperativeTemperature) { tdb = ySi; tr = ySi; }
        else if (dynamicYAxis === FieldKey.WindSpeed) { v = ySi; }
        else if (dynamicYAxis === FieldKey.RelativeHumidity) { rh = ySi; }

        try {
          // Calculate UTCI using the resolved parameters.
          const result = utci(tdb, tr, v, rh, "SI", true, false);
          
          // Map the stress category to a display-ready label.
          const categoryName = String(result.stress_category);
          // Get the short label for the category name. If the name is not in the map, use the category name.
          const shortLabel = utciStressShortLabelByCategory[categoryName as any] ?? categoryName;
          
          // Push UTCI value to row if it exists.
          if (typeof result === "object" && typeof result.utci === "number") {
            row.push(result.utci);
            textRow.push(shortLabel);
          } else {
            // Push NaN and empty string if UTCI doesn't exist.
            row.push(NaN);
            textRow.push("");
          }
        // Catch errors.
        } catch (e) {
          row.push(NaN);
          textRow.push("");
        }
      }
      // Push row to z values.
      zValues.push(row);
      textValues.push(textRow);
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
      zmin: UTCI_MIN,
      zmax: UTCI_MAX,
      hovertemplate: `${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}<br><b>Zone: %{text}</b><br>UTCI: %{z:.1f}<extra></extra>`,
      opacity: 0.75,
      isZone: true,
    }));
  }

  // Add input scatter traces.
  inputs.forEach(({ inputId, payload: inputPayload }) => {
    let inputX: number;
    if (dynamicXAxis === FieldKey.OperativeTemperature) {
      inputX = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, "ASHRAE");
    } else {
      inputX = inputPayload[dynamicXAxis as keyof typeof inputPayload] as number;
    }

    let inputY: number;
    if (dynamicYAxis === FieldKey.OperativeTemperature) {
      inputY = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, "ASHRAE");
    } else {
      inputY = inputPayload[dynamicYAxis as keyof typeof inputPayload] as number;
    }
    
    // Convert input values to SI units.
    inputX = convertFieldValueFromSi(dynamicXAxis, inputX, unitSystem);
    inputY = convertFieldValueFromSi(dynamicYAxis, inputY, unitSystem);

    // Push the input scatter trace if the values exist.
    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(inputX),
      y: roundValue(inputY),
      showLegend: showInputLegend,
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>${xMeta.label} %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label} %{y:.2f} ${yMeta.displayUnits[unitSystem]}<extra></extra>`,
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
        gridcolor: "#e2e8f0",
      },
      yaxis: {
        title: `${yMeta.label} (${yMeta.displayUnits[unitSystem]})`,
        range: [yMin, yMax],
        gridcolor: "#e2e8f0",
      },
      legend: { orientation: "h", x: 0, y: 1.1 },
      height: 480,
    },
    annotations: [],
    source: CalculationSource.FrontendGenerated,
  };
}
