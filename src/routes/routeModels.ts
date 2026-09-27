import type { Standard } from "jsthermalcomfort";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { routeSegmentFor } from "$lib/core/standard";
import { registeredModels } from "$lib/models";

/*
 * Which models the routes offer and how a URL names one. Router-free (unlike
 * `navigation.ts`) so it can load under vitest without `sv-router`'s
 * `createRouter`, which needs `IntersectionObserver`; `navigation.ts`
 * re-exports what pages use.
 */

/** The models of `standard`, in registry order. */
export function modelsOf(
  standard: Standard,
  models: readonly RegisteredModel[] = registeredModels,
): RegisteredModel[] {
  return models.filter((model) => model.standard === standard);
}

/** Models that belong to a standard, in registry order. */
export function standardModels(): RegisteredModel[] {
  return registeredModels.filter((model) => model.standard !== undefined);
}

export function defaultModel(): RegisteredModel {
  const model = standardModels()[0];
  if (!model) {
    throw new Error("No registered model belongs to a standard");
  }
  return model;
}

/** `model.standard`, or throws when the model has none (an Explore-only model has no Standard page). */
export function requireStandard(model: RegisteredModel): NonNullable<RegisteredModel["standard"]> {
  const standard = model.standard;
  if (!standard) {
    throw new Error(`${model.info.label} has no standard and no Standard page`);
  }
  return standard;
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
