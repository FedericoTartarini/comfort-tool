/**
 * The charts a model can offer (ADR §4.4). A closed set in the same shape as
 * `core/quantities.ts`'s table: `as const` objects referenced by identity,
 * never by string key.
 */
export interface ChartType {
  readonly id: string;
  readonly label: string;
}

export const chartType = {
  psychrometric: { id: "psychrometric", label: "Psychrometric" },
  dynamic: { id: "dynamic", label: "Dynamic" },
  adaptive: { id: "adaptive", label: "Adaptive" },
} as const satisfies Record<string, ChartType>;
