/**
 * `plotly.js-cartesian-dist-min` ships a single minified bundle and no types
 * (`@types/plotly.js` is deliberately not installed, ADR §2.1). Declared here
 * is the surface `PlotlyChart.svelte` and `plotlyImage.ts` actually call;
 * trace, layout and config objects are plain records because the app only ever
 * constructs them, from a `ChartSpec` (`plotlyFigure.ts`).
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
    /**
     * Draws a figure given as data and layout, outside the document, and
     * resolves to it as a data URL: Base64 for PNG, URL-encoded for SVG.
     */
    toImage(
      figure: { readonly data: readonly PlotlyData[]; readonly layout: PlotlyLayout },
      options: { format: "png" | "svg"; width: number; height: number; scale: number },
    ): Promise<string>;
    Plots: {
      /** Fits a drawn plot to its element's current size. */
      resize(element: HTMLElement): Promise<unknown>;
    };
  }

  const Plotly: PlotlyModule;
  export default Plotly;
}
