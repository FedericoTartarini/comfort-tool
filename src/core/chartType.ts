/**
 * The charts a model can offer (ADR §4.4). A closed set in the same shape as
 * the library's `quantities`: `as const` objects referenced by identity, never
 * by string key.
 */
export interface ChartType {
  readonly id: string;
  readonly title: string;
}

export const chartType = {
  psychrometric: { id: "psychrometric", title: "Psychrometric" },
  dynamic: { id: "dynamic", title: "Dynamic" },
} as const satisfies Record<string, ChartType>;
