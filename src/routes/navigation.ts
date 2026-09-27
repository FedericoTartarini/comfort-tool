import { createRouter, type Routes } from "sv-router";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { pathSegmentFor, standardFromPath } from "$lib/core/standard";
import { registeredModels } from "$lib/models";
import { modelBySegment, modelsOf, toRouteSegment } from "./modelsOf";

export { modelsOf };

/**
 * The only place sv-router is used (ADR §2). Pages import what they need from
 * here — the route, a path, a way to move the address, a way to take a click
 * on a link — and never the router itself.
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

function routeParams(model: RegisteredModel): { standard: string; model: string } {
  return { standard: pathSegmentFor(requireStandard(model)), model: toRouteSegment(model.info.name) };
}

export function pathTo(model: RegisteredModel): string {
  return p(STANDARD_ROUTE, { params: routeParams(model) });
}

/**
 * Put `model` in the address as a new history entry, which is what following a
 * link has always done: back returns to the model the person came from. Every
 * in-app switch goes through here, so how a person switched does not change
 * what back does.
 */
export function navigateTo(model: RegisteredModel): void {
  void navigate(STANDARD_ROUTE, { params: routeParams(model) });
}

/**
 * Correct an address that names no model, replacing the entry rather than
 * pushing one: the address that was never a model is not somewhere back should
 * return to.
 */
export function redirectTo(model: RegisteredModel): void {
  void navigate(STANDARD_ROUTE, { params: routeParams(model), replace: true });
}

/**
 * Take over an ordinary click on a link so the page can act before the address
 * moves, and report whether it was taken over. sv-router listens for clicks on
 * `window`, so a handler on the anchor itself runs first, and the router skips
 * a click whose default is already prevented — preventing it is therefore the
 * whole of the interception, and the link keeps its address.
 *
 * Left alone: a click the browser will act on itself (a modifier key, a button
 * that is not the primary one) and a click something else has already handled.
 * These are the router's own tests of the event, so a click this declines is
 * one the router declines too, and the browser opens the link elsewhere — an
 * address arrival, which is the path that never asks. The router also tests
 * the anchor (`target`, `download`, the href's shape and origin); that stays
 * with whoever writes the anchor, as the page's own model links do.
 */
export function interceptLinkClick(event: MouseEvent): boolean {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.defaultPrevented
  ) {
    return false;
  }
  event.preventDefault();
  return true;
}

/** The model the current URL names, or `undefined` when it names none. */
export function modelFromRoute(): RegisteredModel | undefined {
  const params: Partial<Record<"standard" | "model", string>> = route.params;
  return modelBySegment(standardFromPath(params.standard ?? ""), params.model);
}
