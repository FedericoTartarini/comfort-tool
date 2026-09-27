import type { Standard } from "jsthermalcomfort";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { routeSegmentFor } from "$lib/core/standard";
import { registeredModels } from "$lib/models";

/**
 * The models of `standard`, in registry order. Router-free (unlike the rest
 * of `routes/`) so it can load under vitest without `sv-router`'s
 * `createRouter`, which needs `IntersectionObserver`.
 */
export function modelsOf(
  standard: Standard,
  models: readonly RegisteredModel[] = registeredModels,
): RegisteredModel[] {
  return models.filter((model) => model.standard === standard);
}

/**
 * The route segment for a model name: the library's function name with its
 * underscores spelled as hyphens (`pmv_ppd_iso` → `pmv-ppd-iso`). The one
 * place a model's URL spelling is derived, so a declaration writes no route
 * of its own (ADR-0002 decision 30).
 */
export function toRouteSegment(name: string): string {
  // Not `replaceAll`: tsconfig targets ES2020, which does not have it.
  return name.replace(/_/g, "-");
}

/**
 * The model whose own route segments are `standardSegment` and `modelSegment`,
 * or `undefined` when the URL names none. Matched against each registered
 * model's segments rather than by parsing the address into a `Standard` first:
 * two editions of one standard share a segment (ADR-0002 decision 6), and a
 * model pinned to either must be found by the address it produces. A
 * standard-less model has no Standard page and so is never found.
 */
export function modelBySegment(
  standardSegment: string | undefined,
  modelSegment: string | undefined,
  models: readonly RegisteredModel[] = registeredModels,
): RegisteredModel | undefined {
  return models.find(
    (model) =>
      model.standard !== undefined &&
      routeSegmentFor(model.standard) === standardSegment &&
      toRouteSegment(model.info.name) === modelSegment,
  );
}
