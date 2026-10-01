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
export function requireStandard(model: RegisteredModel): Standard {
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
 * A model's address: its standard's route segment and its own, keyed as the
 * standard route's params. The one place the two are paired, so the address a
 * model is written to and the one it is found by cannot drift apart. Throws
 * for a model with no standard, which has no Standard page.
 */
export function routeSegmentsOf(model: RegisteredModel): { standard: string; model: string } {
  return { standard: routeSegmentFor(requireStandard(model)), model: toRouteSegment(model.info.name) };
}

/**
 * A model's Explore address: its own route segment alone, keyed as the Explore
 * route's params. Every model has one, a model with no standard included.
 */
export function exploreSegmentsOf(model: RegisteredModel): { model: string } {
  return { model: toRouteSegment(model.info.name) };
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
  return models.find((model) => {
    if (model.standard === undefined) {
      return false;
    }
    const segments = routeSegmentsOf(model);
    return segments.standard === standardSegment && segments.model === modelSegment;
  });
}

/**
 * The model whose own Explore segment is `modelSegment`, or `undefined` when
 * the URL names none. Every registered model is found, a standard-less one
 * included.
 */
export function modelByExploreSegment(
  modelSegment: string | undefined,
  models: readonly RegisteredModel[] = registeredModels,
): RegisteredModel | undefined {
  return models.find((model) => exploreSegmentsOf(model).model === modelSegment);
}
