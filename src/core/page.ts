import type { RegisteredModel } from "./modelDeclaration";

/**
 * The app's pages (ADR-0002 decision 57). A closed set in the same shape as
 * `core/quantities.ts`'s table: `as const` objects referenced by identity,
 * never by string key.
 */
export interface Page {
  readonly id: string;
  readonly title: string;
}

export const page = {
  standard: { id: "standard", title: "Standard" },
  explore: { id: "explore", title: "Explore" },
  timeSeries: { id: "time-series", title: "Time-series" },
} as const satisfies Record<string, Page>;

/** Where the address points: a page, and the model it is open on. */
export interface Address {
  readonly page: Page;
  readonly model: RegisteredModel;
}

/**
 * The pages `model` has, in the set's order. Read, never declared: Standard
 * needs the model's standard, Explore every model has, and Time-series needs
 * the declaration's `timeSeries`.
 */
export function pagesOf(model: RegisteredModel): Page[] {
  return [
    ...(model.standard === undefined ? [] : [page.standard]),
    page.explore,
    ...(model.timeSeries ? [page.timeSeries] : []),
  ];
}
