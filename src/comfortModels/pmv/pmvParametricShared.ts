import {
  inputOrder,
  type InputId as InputIdType,
} from "../../models/inputSlots";
import type { PmvChartSourceDto, PmvRequestDto } from "./pmvCalculation";

export const PARAMETRIC_TDB_RANGE_SI = { min: 10, max: 40 } as const;
export const PARAMETRIC_TDB_POINTS = 31;

export function sampleParametricDryBulbSi(): number[] {
  const { min, max } = PARAMETRIC_TDB_RANGE_SI;
  return Array.from({ length: PARAMETRIC_TDB_POINTS }, (_, index) => (
    min + ((max - min) * index) / (PARAMETRIC_TDB_POINTS - 1)
  ));
}

export function isPmvRequest(value: unknown): value is PmvRequestDto {
  if (!value || typeof value !== "object") return false;
  const request = value as PmvRequestDto;
  return (
    Number.isFinite(request.tdb)
    && Number.isFinite(request.tr)
    && Number.isFinite(request.vr)
    && Number.isFinite(request.rh)
    && Number.isFinite(request.met)
    && Number.isFinite(request.clo)
    && Number.isFinite(request.wme)
  );
}

function asChartSource(chartSource: unknown): PmvChartSourceDto | null {
  if (!chartSource || typeof chartSource !== "object" || !("inputs" in chartSource)) {
    return null;
  }
  return chartSource as PmvChartSourceDto;
}

export function readPmvRequestFromChartSource(
  chartSource: unknown,
  inputId: InputIdType,
): PmvRequestDto | null {
  const payload = asChartSource(chartSource)?.inputs[inputId];
  return isPmvRequest(payload) ? payload : null;
}

export function readPmvRequestsByInput(
  chartSource: unknown,
): Partial<Record<InputIdType, PmvRequestDto>> {
  const source = asChartSource(chartSource);
  if (!source) return {};
  const requests: Partial<Record<InputIdType, PmvRequestDto>> = {};
  for (const inputId of inputOrder) {
    const payload = source.inputs[inputId];
    if (isPmvRequest(payload)) {
      requests[inputId] = payload;
    }
  }
  return requests;
}
