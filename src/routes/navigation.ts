import { createRouter, type Routes } from "sv-router";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { defaultModel, modelBySegment, modelsOf, requireStandard, routeSegmentsOf } from "./routeModels";

export { defaultModel, modelsOf, requireStandard };

/**
 * The only place sv-router is used (ADR §2). Pages import what they need from
 * here — the model the route names, a path, a way to move the address, a way
 * to follow it, a way to take a click on a link — and never the router itself.
 */
const STANDARD_ROUTE = "/standard/:standard/:model";

const routes = {
  hooks: { afterLoad: passAddressOn },
  [STANDARD_ROUTE]: () => import("./StandardPage.svelte"),
  // Anything else (including "/") lands on the page, and the address is then
  // corrected to the default model. sv-router matches with or without a
  // trailing slash.
  "*": () => import("./StandardPage.svelte"),
  // Only there for an sv-router matcher bug (0.18.1 and 0.19.0): match-route.js
  // treats the `hooks` key as a path, so "/hooks" looks up this entry and throws
  // when it is missing. With it, "/hooks" lands on the page and is corrected
  // like any other address that names no model.
  "/hooks": () => import("./StandardPage.svelte"),
} as const satisfies Routes;

const { p, navigate, route } = createRouter(routes);
export { Router } from "sv-router";

const addressFollowers = new Set<(model: RegisteredModel) => void>();

/**
 * Hear every model the address names from now on — a typed URL, back and
 * forward, a link the router follows, and the app's own navigation — and
 * return the way to stop. This is the address's path, which never asks
 * (ADR-0002 decision 32), so a page hands over the session's `setModel`, and
 * after an in-app switch it finds the model already current. The address a page
 * opens on is not heard: the router loads it before the page exists, so the
 * page reads it with {@link modelFromRoute} instead.
 */
export function followAddress(onModel: (model: RegisteredModel) => void): () => void {
  addressFollowers.add(onModel);
  return () => {
    addressFollowers.delete(onModel);
  };
}

/**
 * The router's after-load hook, run once the address has moved and the route's
 * params are set. An address that names no model is corrected here rather than
 * before it loads, because only now are its params known; the correction is one
 * more navigation, whose own run of this hook hands the default model on.
 */
function passAddressOn(): void {
  const model = modelFromRoute();
  if (!model) {
    redirectTo(defaultModel());
    return;
  }
  for (const onModel of addressFollowers) {
    onModel(model);
  }
}

export function pathTo(model: RegisteredModel): string {
  return p(STANDARD_ROUTE, { params: routeSegmentsOf(model) });
}

/**
 * Put `model` in the address as a new history entry, which is what following a
 * link has always done: back returns to the model the person came from. Every
 * in-app switch goes through here, so how a person switched does not change
 * what back does.
 */
export function navigateTo(model: RegisteredModel): void {
  void navigate(STANDARD_ROUTE, { params: routeSegmentsOf(model) });
}

/**
 * Correct an address that names no model, replacing the entry rather than
 * pushing one: the address that was never a model is not somewhere back should
 * return to.
 */
function redirectTo(model: RegisteredModel): void {
  void navigate(STANDARD_ROUTE, { params: routeSegmentsOf(model), replace: true });
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
  const params = route.params;
  return modelBySegment(params.standard, params.model);
}
