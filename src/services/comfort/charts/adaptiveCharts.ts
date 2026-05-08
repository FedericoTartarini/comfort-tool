/**
 * Adaptive Comfort Chart Services
 * 
 * Provides functions for building Adaptive comfort model charts (ASHRAE 55 and 
 * EN 16798-1). Handles the generation of static comfort polygons and dynamic 
 * heatmaps based on prevailing outdoor conditions and indoor operative temperatures.
 */
import { t_o } from "jsthermalcomfort";
import { FieldKey } from "../../../models/fieldKeys";
import { fieldMetaByKey } from "../../../models/inputFieldsMeta";
import { CalculationSource } from "../../../models/calculationMetadata";
import { inputDisplayMetaById } from "../../../models/inputSlotPresentation";
import { UnitSystem, type UnitSystem as UnitSystemType } from "../../../models/units";
import type {
  PlotlyChartResponseDto,
  PlotTraceDto,
  AdaptiveChartInputsRequestDto,
  AdaptiveRequestDto,
} from "../../../models/comfortDtos";
import { convertFieldValueFromSi, convertFieldValueToSi } from "../../units";
import { getCompareInputs, roundValue } from "../helpers";
import { buildComfortPolygonTrace, buildInputScatterTrace, buildContourTrace } from "./plotlyBuilders";
import { AdaptiveStandardMode } from "../../../models/inputModes";
import { getCe, calculateAdaptive } from "../adaptive";
import { InputId as InputIdType } from "../../../models/inputSlots";
import type { FieldKey as FieldKeyType } from "../../../models/fieldKeys";

// Discrete colorscales for Adaptive ASHRAE 55 Dynamic Chart.
const ADAPTIVE_ASHRAE_COLORSCALE = [
  [0, "#3b82f6"],     // 1: Too cool (Blue)
  [0.25, "#3b82f6"],
  [0.25, "#86efac"],  // 2: 80% Acceptability (Light Green)
  [0.5, "#86efac"],
  [0.5, "#22c55e"],   // 3: 90% Acceptability (Green)
  [0.75, "#22c55e"],
  [0.75, "#ef4444"],  // 4: Too warm (Red)
  [1, "#ef4444"],
];
// Discrete colorscales for Adaptive EN 16798-1 Dynamic Chart.
const ADAPTIVE_EN_COLORSCALE = [
  [0, "#3b82f6"],     // 1: Too cool (Blue)
  [0.2, "#3b82f6"],
  [0.2, "#fde047"],   // 2: EN Category III (Yellow)
  [0.4, "#fde047"],
  [0.4, "#86efac"],   // 3: EN Category II / ASHRAE 80% (Light Green)
  [0.6, "#86efac"],
  [0.6, "#22c55e"],   // 4: EN Category I / ASHRAE 90% (Green)
  [0.8, "#22c55e"],
  [0.8, "#ef4444"],   // 5: Too warm (Red)
  [1, "#ef4444"],
];

// Contours for the Adaptive dynamic chart.
const ADAPTIVE_CONTOURS = {
  coloring: "fill",
  showlines: false,
  type: "levels",
  // Ensure the contours align with our discrete integer values (1, 2, 3, etc.)
  size: 1,
};

/**
 * Builds the adaptive comfort chart (Prevailing Mean Outdoor Temperature (TRM) vs Operative Temperature (To)).
 * It maps out comfort boundary polygons (80%/90% or Cat I/II/III) and scatter points for inputs.
 *
 * @param payload Adaptive chart's inputs request data transfer object (DTO).
 * @param standardMode The selected standard (ASHRAE 55 or EN 16798-1).
 * @param unitSystem The active unit system (SI or IP).
 * @param baselineInputId Baseline input ID for background comfort zones.
 * @returns Complete plotly response bindings (traces and layout).
 */
export function buildAdaptiveChart(
  payload: AdaptiveChartInputsRequestDto,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType = UnitSystem.SI,
  baselineInputId?: string,
): PlotlyChartResponseDto {
  // Get the inputs for the chart.
  const inputs = getCompareInputs(payload.inputs);
  // Show input legend if there are multiple inputs.
  const showInputLegend = inputs.length > 1;
  // Get the temperature's display units.
  const temperatureDisplayUnits = fieldMetaByKey[FieldKey.DryBulbTemperature].displayUnits[unitSystem];
  // Create traces.
  const traces: PlotTraceDto[] = [];
  // Check if the standard is ASHRAE.
  const isAshrae = standardMode === AdaptiveStandardMode.Ashrae;
  // Set prevailing mean outdoor temperature (TRM) limits.
  const trmMin = 10;
  // Set the maximum TRM to 33.5 if it's ASHRAE 55, else 30 for EN 16798-1.
  const trmMax = isAshrae ? 33.5 : 30;

  // Determine the baseline input for background comfort zones.
  const baselineInput = inputs.find(i => i.inputId === baselineInputId) || inputs[0];
  
  // Generate background comfort zones if baseline input is provided.
  if (baselineInput) {
    const v = baselineInput.payload.v;
    const baseTrmPoints = Array.from({ length: 200 }, (_, i) => trmMin + ((trmMax - trmMin) * i) / 199);
    
    const findTransitionTrm = (limit: number) => {
      const offset = isAshrae ? 17.8 : 18.8;
      const slope = isAshrae ? 0.31 : 0.33;
      return (25.0 - limit - offset) / slope;
    };

    const trmPoints: number[] = [...baseTrmPoints];
    if (isAshrae) {
      const t80 = findTransitionTrm(3.5);
      const t90 = findTransitionTrm(2.5);
      if (t80 && t80 > trmMin && t80 < trmMax) trmPoints.push(t80 - 0.0001, t80 + 0.0001);
      if (t90 && t90 > trmMin && t90 < trmMax) trmPoints.push(t90 - 0.0001, t90 + 0.0001);
    } else { 
      const tI = findTransitionTrm(2.0);
      const tII = findTransitionTrm(3.0);
      const tIII = findTransitionTrm(4.0);
      if (tI && tI > trmMin && tI < trmMax) trmPoints.push(tI - 0.0001, tI + 0.0001);
      if (tII && tII > trmMin && tII < trmMax) trmPoints.push(tII - 0.0001, tII + 0.0001);
      if (tIII && tIII > trmMin && tIII < trmMax) trmPoints.push(tIII - 0.0001, tIII + 0.0001);
    }
    trmPoints.sort((a, b) => a - b);

    let lower80: number[] = [];
    let upper80: number[] = [];
    let lower90: number[] = [];
    let upper90: number[] = [];
    let lowerI: number[] = [];
    let upperI: number[] = [];
    let lowerII: number[] = [];
    let upperII: number[] = [];
    let lowerIII: number[] = [];
    let upperIII: number[] = [];

    trmPoints.forEach((trm) => {
      if (isAshrae) {
        const t_cmf = 0.31 * trm + 17.8;
        const up80_base = t_cmf + 3.5;
        const up80 = up80_base > 25.0 ? up80_base + getCe(v, up80_base + getCe(v, 25.1)) : up80_base;
        const up90_base = t_cmf + 2.5;
        const up90 = up90_base > 25.0 ? up90_base + getCe(v, up90_base + getCe(v, 25.1)) : up90_base;
        lower80.push(t_cmf - 3.5);
        upper80.push(up80);
        lower90.push(t_cmf - 2.5);
        upper90.push(up90);
      } else {
        const t_cmf = 0.33 * trm + 18.8;
        const upI_base = t_cmf + 2.0;
        const upI = upI_base > 25.0 ? upI_base + getCe(v, upI_base + getCe(v, 25.1)) : upI_base;
        const upII_base = t_cmf + 3.0;
        const upII = upII_base > 25.0 ? upII_base + getCe(v, upII_base + getCe(v, 25.1)) : upII_base;
        const upIII_base = t_cmf + 4.0;
        const upIII = upIII_base > 25.0 ? upIII_base + getCe(v, upIII_base + getCe(v, 25.1)) : upIII_base;
        lowerI.push(t_cmf - 3.0);
        upperI.push(upI);
        lowerII.push(t_cmf - 4.0);
        upperII.push(upII);
        lowerIII.push(t_cmf - 5.0);
        upperIII.push(upIII);
      }
    });

    const addPolygon = (lower: number[], upper: number[], nameSuffix: string) => {
      const polygonX = trmPoints.concat(trmPoints.slice().reverse());
      const polygonY = lower.concat(upper.slice().reverse());
      traces.push(buildComfortPolygonTrace({
        inputId: baselineInput.inputId,
        nameSuffix,
        polygonX: polygonX.map((x) => roundValue(convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, x, unitSystem))),
        polygonY: polygonY.map((y) => roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, y, unitSystem))),
        hovertemplate: `Trm %{x:.1f} ${temperatureDisplayUnits}<br>To %{y:.1f} ${temperatureDisplayUnits}<extra></extra>`,
        isZone: true,
      }));
    };

    if (isAshrae) {
      addPolygon(lower80, upper80, "80% Acceptability");
      addPolygon(lower90, upper90, "90% Acceptability");
    } else {
      addPolygon(lowerI, upperI, "Category I");
      addPolygon(lowerII, upperII, "Category II");
      addPolygon(lowerIII, upperIII, "Category III");
    }
  }

  // Create data points for each input.
  inputs.forEach(({ inputId, payload: inputPayload }) => {
    const to = t_o(inputPayload.tdb, inputPayload.tr, inputPayload.v, standardMode === AdaptiveStandardMode.Ashrae ? "ASHRAE" : "ISO");
    traces.push(buildInputScatterTrace({
      inputId,
      x: roundValue(convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, inputPayload.trm, unitSystem)),
      y: roundValue(convertFieldValueFromSi(FieldKey.DryBulbTemperature, to, unitSystem)),
      showLegend: showInputLegend,
      hovertemplate: `${inputDisplayMetaById[inputId]?.label ?? "Input"}<br>` +
        `Trm %{x:.1f} ${temperatureDisplayUnits}<br>` +
        `To %{y:.1f} ${temperatureDisplayUnits}<extra></extra>`,
      markerSize: 14,
    }));
  });

  // Return the chart traces and layout.
  return {
    traces,
    layout: {
      // Chart title.
      title: isAshrae ? "ASHRAE 55 Adaptive Chart" : "EN 16798-1 Adaptive Chart",
      // Background color.
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#f8fafc",
      // Show legend.
      showlegend: true,
      // Margin around the chart.
      margin: { l: 64, r: 24, t: 48, b: 80 },
      // X-axis settings.
      xaxis: {
        // X-axis title. Displays first string if ASHRAE-55, or second string if EN 16798-1.
        title: isAshrae
          ? `Prevailing mean outdoor temperature (${temperatureDisplayUnits})`
          : `Running mean outdoor temperature (${temperatureDisplayUnits})`,
        // X-axis range.
        range: [
          convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, 10, unitSystem),
          convertFieldValueFromSi(FieldKey.PrevailingMeanOutdoorTemperature, trmMax, unitSystem),
        ],
        // X-axis grid color.
        gridcolor: "#e2e8f0",
      },
      // Y-axis settings.
      yaxis: {
        // Y-axis title. 
        title: `Operative temperature (${temperatureDisplayUnits})`,
        // Y-axis range.
        range: [
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, 10, unitSystem),
          convertFieldValueFromSi(FieldKey.DryBulbTemperature, 40, unitSystem),
        ],
        // Y-axis grid color.
        gridcolor: "#e2e8f0",
      },
      // Legend settings.
      legend: { orientation: "h", x: 0, y: 1.1 },
      // Chart height.
      height: 480,
    },
    // Annotations.
    annotations: [],
    // The source of the calculation, indicating it was generated directly in the browser.
    source: CalculationSource.FrontendGenerated,
  };
}

/**
 * Builds the adaptive comfort chart with dynamic X and Y axes.
 * 
 * @param payload Adaptive chart's inputs request data transfer object (DTO).
 * @param standardMode The selected standard (ASHRAE 55 or EN 16798-1).
 * @param unitSystem The active unit system (SI or IP).
 * @param dynamicXAxis The X-axis field key.
 * @param dynamicYAxis The Y-axis field key.
 * @param baselineInputId The baseline input ID.
 * @returns Complete plotly response bindings (traces and layout).
 */
export function buildAdaptiveDynamicChart(
  payload: AdaptiveChartInputsRequestDto,
  standardMode: AdaptiveStandardMode,
  unitSystem: UnitSystemType = UnitSystem.SI,
  dynamicXAxis?: FieldKeyType,
  dynamicYAxis?: FieldKeyType,
  baselineInputId?: string,
): PlotlyChartResponseDto {
  // Get the inputs for the chart.
  const inputs = getCompareInputs(payload.inputs);
  const showInputLegend = inputs.length > 1;

  // Create traces.
  const traces: PlotTraceDto[] = [];

  // Check if the X and Y axes are valid.
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

  // Get the active input payload.
  const activeInputPayload = (payload.inputs[baselineInputId as any] || inputs[0]?.payload);

  // Get the metadata for the X and Y axes.
  const xMeta = fieldMetaByKey[dynamicXAxis];
  const yMeta = fieldMetaByKey[dynamicYAxis];

  // Get the minimum and maximum values for the X and Y axes.
  const xMin = convertFieldValueFromSi(dynamicXAxis, xMeta.minValue, unitSystem);
  const xMax = convertFieldValueFromSi(dynamicXAxis, xMeta.maxValue, unitSystem);
  const yMin = convertFieldValueFromSi(dynamicYAxis, yMeta.minValue, unitSystem);
  const yMax = convertFieldValueFromSi(dynamicYAxis, yMeta.maxValue, unitSystem);

  // Create the data points for the X and Y axes.
    const xPoints = 50;
    const yPoints = 50;
    const xValues: number[] = [];
    const yValues: number[] = [];

    // Create the data points for the X and Y axes.
    for (let i = 0; i < xPoints; i++) xValues.push(xMin + (xMax - xMin) * (i / (xPoints - 1)));
    for (let i = 0; i < yPoints; i++) yValues.push(yMin + (yMax - yMin) * (i / (yPoints - 1)));

    // Create the Z values and text values for the chart.
    const zValues: (number | null)[][] = [];
    const textValues: string[][] = [];

    // Create the Z values and text values for the chart.
    for (let i = 0; i < yPoints; i++) {
      const row: (number | null)[] = [];
      const textRow: string[] = [];
      const ySi = convertFieldValueToSi(dynamicYAxis, yValues[i], unitSystem);
      
      for (let j = 0; j < xPoints; j++) {
        const xSi = convertFieldValueToSi(dynamicXAxis, xValues[j], unitSystem);
        
        let tdb = activeInputPayload.tdb;
        let trm = activeInputPayload.trm;
        let v = activeInputPayload.v;

        // Override values based on the selected dynamic axes.
        if (dynamicXAxis === FieldKey.DryBulbTemperature) { tdb = xSi; }
        else if (dynamicXAxis === FieldKey.PrevailingMeanOutdoorTemperature) { trm = xSi; }
        else if (dynamicXAxis === FieldKey.RelativeAirSpeed) { v = xSi; }

        if (dynamicYAxis === FieldKey.DryBulbTemperature) { tdb = ySi; }
        else if (dynamicYAxis === FieldKey.PrevailingMeanOutdoorTemperature) { trm = ySi; }
        else if (dynamicYAxis === FieldKey.RelativeAirSpeed) { v = ySi; }

        // Perform the adaptive calculation.
        try {
          const result = calculateAdaptive({
            tdb,
            tr: tdb, // Assumes tr = tdb for simplicity in the heatmap
            trm,
            v,
            units: UnitSystem.SI,
          }, standardMode);

          if (standardMode === AdaptiveStandardMode.Ashrae) {
            if (result.acceptability_90) {
              row.push(3);
              textRow.push("90% Acceptability");
            } else if (result.acceptability_80) {
              row.push(2);
              textRow.push("80% Acceptability");
            } else {
              const t_cmf = 0.31 * trm + 17.8;
              if (tdb > t_cmf) {
                row.push(4);
                textRow.push("Too Warm");
              } else {
                row.push(1);
                textRow.push("Too Cool");
              }
            }
          } else {
            if (result.acceptability_cat_i) {
              row.push(4);
              textRow.push("Category I");
            } else if (result.acceptability_cat_ii) {
              row.push(3);
              textRow.push("Category II");
            } else if (result.acceptability_cat_iii) {
              row.push(2);
              textRow.push("Category III");
            } else {
              const t_cmf = 0.33 * trm + 18.8;
              if (tdb > t_cmf) {
                row.push(5);
                textRow.push("Too Warm");
              } else {
                row.push(1);
                textRow.push("Too Cool");
              }
            }
          }
        } catch {
          row.push(null);
          textRow.push("Error");
        }
      }
      zValues.push(row);
      textValues.push(textRow);
    }

    // Add the contour trace to the traces.
    traces.push(buildContourTrace({
      name: "Acceptability Zones",
      x: xValues,
      y: yValues,
      z: zValues as any,
      text: textValues,
      colorscale: standardMode === AdaptiveStandardMode.Ashrae ? ADAPTIVE_ASHRAE_COLORSCALE : ADAPTIVE_EN_COLORSCALE,
      contours: ADAPTIVE_CONTOURS,
      showscale: false,
      hovertemplate: `${xMeta.label}: %{x:.2f} ${xMeta.displayUnits[unitSystem]}<br>${yMeta.label}: %{y:.2f} ${yMeta.displayUnits[unitSystem]}<br><b>Zone: %{text}</b><extra></extra>`,
      zmin: 1,
      zmax: standardMode === AdaptiveStandardMode.Ashrae ? 4 : 5,
      opacity: 0.8,
      isZone: true,
    }));

    // Add the scatter points for each input.
    inputs.forEach(({ inputId, payload: inputPayload }) => {
      let inputX = inputPayload[dynamicXAxis as keyof typeof inputPayload] as number;
      let inputY = inputPayload[dynamicYAxis as keyof typeof inputPayload] as number;
      
      inputX = convertFieldValueFromSi(dynamicXAxis, inputX, unitSystem);
      inputY = convertFieldValueFromSi(dynamicYAxis, inputY, unitSystem);

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
        title: `Adaptive Dynamic Chart (${xMeta.label} vs ${yMeta.label})`,
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
