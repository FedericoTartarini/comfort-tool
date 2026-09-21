import type { Standard } from "jsthermalcomfort";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
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
 * place a model's URL spelling is derived, so the name is the only thing a
 * declaration writes (ADR-0002 decision 30).
 */
export function toRouteSegment(name: string): string {
  // Not `replaceAll`: tsconfig targets ES2020, which does not have it.
  return name.replace(/_/g, "-");
}

/**
 * The model of `standard` whose route segment is `segment`, or `undefined`
 * when the URL names none. A standard-less model has no Standard page and so
 * is never found, not even by a URL whose standard segment parses to nothing.
 */
export function modelBySegment(
  standard: Standard | undefined,
  segment: string | undefined,
  models: readonly RegisteredModel[] = registeredModels,
): RegisteredModel | undefined {
  if (standard === undefined) {
    return undefined;
  }
  return modelsOf(standard, models).find((model) => toRouteSegment(model.name) === segment);
}
