import { createRouter, type Routes } from "sv-router";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { pathSegmentFor, standardFromPath } from "$lib/core/standard";
import { registeredModels } from "$lib/models";

/**
 * The only place sv-router is used (ADR §2). Pages import `route`, `pathTo`
 * and `navigateTo` from here and never the router itself.
 */
const STANDARD_ROUTE = "/standard/:standard/:model";

const routes = {
  [STANDARD_ROUTE]: () => import("./StandardPage.svelte"),
  // Anything else (including "/") lands on the page, which redirects to the
  // default model. sv-router matches with or without a trailing slash.
  "*": () => import("./StandardPage.svelte"),
} as const satisfies Routes;

export const { p, navigate, route } = createRouter(routes);
export { Router } from "sv-router";

/** Models that belong to a standard, in registry order. */
export function standardModels(): RegisteredModel[] {
  return registeredModels.filter((model) => model.model.standard !== undefined);
}

export function defaultModel(): RegisteredModel {
  const model = standardModels()[0];
  if (!model) {
    throw new Error("No registered model belongs to a standard");
  }
  return model;
}

function routeParams(model: RegisteredModel): { standard: string; model: string } {
  const standard = model.model.standard;
  if (!standard) {
    throw new Error(`${model.model.label} has no standard and no Standard page`);
  }
  return { standard: pathSegmentFor(standard), model: model.pathSegment };
}

export function pathTo(model: RegisteredModel): string {
  return p(STANDARD_ROUTE, { params: routeParams(model) });
}

export function navigateTo(model: RegisteredModel): void {
  void navigate(STANDARD_ROUTE, { params: routeParams(model), replace: true });
}

/** The model the current URL names, or `undefined` when it names none. */
export function modelFromRoute(): RegisteredModel | undefined {
  const params: Partial<Record<"standard" | "model", string>> = route.params;
  const standard = standardFromPath(params.standard ?? "");
  return standardModels().find(
    (model) => model.model.standard === standard && model.pathSegment === params.model,
  );
}
