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
