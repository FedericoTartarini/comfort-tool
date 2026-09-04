/**
 * `plotly.js-cartesian-dist-min` ships a single minified bundle and no types
 * (`@types/plotly.js` is deliberately not installed, ADR §2.1). Declared here
 * is the surface `PlotlyChart.svelte` actually calls; trace, layout and config
 * objects are plain records because the app only ever constructs them, from a
 * `ChartSpec`.
 */
declare module "plotly.js-cartesian-dist-min" {
  export type PlotlyData = Record<string, unknown>;
  export type PlotlyLayout = Record<string, unknown>;
  export type PlotlyConfig = Record<string, unknown>;
  export type PlotlyAnnotation = Record<string, unknown>;

  interface PlotlyModule {
    newPlot(
      element: HTMLElement,
      data: readonly PlotlyData[],
      layout?: PlotlyLayout,
      config?: PlotlyConfig,
    ): Promise<unknown>;
    react(
      element: HTMLElement,
      data: readonly PlotlyData[],
      layout?: PlotlyLayout,
      config?: PlotlyConfig,
    ): Promise<unknown>;
    purge(element: HTMLElement): void;
  }

  const Plotly: PlotlyModule;
  export default Plotly;
}
