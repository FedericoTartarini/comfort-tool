import { ChartType } from "../catalog/chartTypes";
import { adaptiveFigure, assembleAdaptive } from "./adaptive";
import { assembleBodyTemperature, bodyTemperatureFigure } from "./bodyTemperature";
import { assembleDynamic, dynamicFigure } from "./dynamic";
import { assembleHeatLoss, heatLossFigure } from "./heatLoss";
import { assemblePsychrometric, psychrometricFigure } from "./psychrometric";
import { assembleSet, setFigure } from "./set";
import type { AssembleResult, ChartPayload } from "./types";
import { assembleUtci, utciFigure } from "./utci";
import { assembleWaterLoss, waterLossFigure } from "./waterLoss";

export { destroy, draw, exportImage, loadPlotly, prepareFigure } from "./draw";
export type { PlotlyModule } from "./draw";
export * from "./types";

export function assembleChart(payload: ChartPayload): AssembleResult {
  switch (payload.type) {
    case ChartType.Psychrometric:
      return assemblePsychrometric(payload.input);
    case ChartType.Dynamic:
      return assembleDynamic(payload.input);
    case ChartType.HeatLoss:
      return assembleHeatLoss(payload.input);
    case ChartType.Set:
      return assembleSet(payload.input);
    case ChartType.Adaptive:
      return assembleAdaptive(payload.input);
    case ChartType.Utci:
      return assembleUtci(payload.input);
    case ChartType.BodyTemperature:
      return assembleBodyTemperature(payload.input);
    case ChartType.WaterLoss:
      return assembleWaterLoss(payload.input);
  }
}

export function renderChart(
  root: HTMLElement,
  payload: ChartPayload,
): Promise<void> {
  switch (payload.type) {
    case ChartType.Psychrometric:
      return psychrometricFigure(root, payload.input);
    case ChartType.Dynamic:
      return dynamicFigure(root, payload.input);
    case ChartType.HeatLoss:
      return heatLossFigure(root, payload.input);
    case ChartType.Set:
      return setFigure(root, payload.input);
    case ChartType.Adaptive:
      return adaptiveFigure(root, payload.input);
    case ChartType.Utci:
      return utciFigure(root, payload.input);
    case ChartType.BodyTemperature:
      return bodyTemperatureFigure(root, payload.input);
    case ChartType.WaterLoss:
      return waterLossFigure(root, payload.input);
  }
}
