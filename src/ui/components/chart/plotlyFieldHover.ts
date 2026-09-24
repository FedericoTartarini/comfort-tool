export const FIELD_HOVER_PROBE_META = "field-hover-probe";

export interface PlotlyAxisInternals {
  _offset: number;
  _length: number;
  p2l: (px: number) => number;
}

export interface PlotlyGraphDiv extends HTMLElement {
  _fullLayout?: {
    xaxis?: PlotlyAxisInternals;
    yaxis?: PlotlyAxisInternals;
  };
  data?: Array<{
    meta?: unknown;
  }>;
}

export function createFieldHoverProbeTrace(): Record<string, unknown> {
  return {
    type: "scatter",
    mode: "markers",
    x: [null],
    y: [null],
    marker: { size: 0.1, opacity: 0 },
    showlegend: false,
    hoverinfo: "all",
    hovertemplate: " ",
    meta: FIELD_HOVER_PROBE_META,
    name: "",
  };
}

/**
 * Plotly.restyle unwraps one array per selected trace. `x`/`y` therefore use
 * `[[value]]` so the trace keeps a one-point array. Per-point `customdata` is
 * a row (`[v0, v1, …]`), so it needs the same extra wrap: `[[row]]`.
 */
export function probeRestyleAttributes(
  xDisplay: number,
  yDisplay: number,
  hit: { hovertemplate: string; customdata?: unknown },
): Record<string, unknown> {
  const row = hit.customdata === undefined ? [] : hit.customdata;
  return {
    x: [[xDisplay]],
    y: [[yDisplay]],
    hovertemplate: hit.hovertemplate,
    customdata: [[row]],
  };
}

export function findProbeTraceIndex(gd: PlotlyGraphDiv): number {
  return gd.data?.findIndex((trace) => trace.meta === FIELD_HOVER_PROBE_META) ?? -1;
}

export function nativeHoverSkipTraceIndices(gd: PlotlyGraphDiv): number[] {
  const traces = gd.data ?? [];
  const indices: number[] = [];
  for (let index = 0; index < traces.length; index += 1) {
    if (traces[index].meta !== FIELD_HOVER_PROBE_META) indices.push(index);
  }
  return indices;
}

export function plotDisplayCoordinates(
  gd: PlotlyGraphDiv,
  clientX: number,
  clientY: number,
): { xDisplay: number; yDisplay: number } | null {
  const xaxis = gd._fullLayout?.xaxis;
  const yaxis = gd._fullLayout?.yaxis;
  if (!xaxis || !yaxis) return null;
  const rect = gd.getBoundingClientRect();
  const xpx = clientX - rect.left - xaxis._offset;
  const ypx = clientY - rect.top - yaxis._offset;
  if (xpx < 0 || xpx > xaxis._length || ypx < 0 || ypx > yaxis._length) {
    return null;
  }
  const xDisplay = xaxis.p2l(xpx);
  const yDisplay = yaxis.p2l(ypx);
  if (!Number.isFinite(xDisplay) || !Number.isFinite(yDisplay)) return null;
  return { xDisplay, yDisplay };
}
