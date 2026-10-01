import { createRouter, type Routes } from "sv-router";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address } from "$lib/core/page";
import {
  defaultModel,
  exploreSegmentsOf,
  isCurrentLink,
  modelByExploreSegment,
  modelBySegment,
  modelChoicesOn,
  routeSegmentsOf,
  standardLinks,
} from "./routeModels";

export { defaultModel, isCurrentLink, modelChoicesOn, standardLinks };

/**
 * The only place sv-router is used (ADR §2). The app and its pages import
 * what they need from here — the address the route names, a path, a way to
 * move the address, a way to follow it, a way to take a click on a link — and
 * never the router itself.
 */
const STANDARD_ROUTE = "/standard/:standard/:model";
/** Explore names the model alone: every model has the page, one with no standard included (ADR-0002 decision 57). */
const EXPLORE_ROUTE = "/explore/:model";

const routes = {
  hooks: { afterLoad: passAddressOn },
  [STANDARD_ROUTE]: () => import("./StandardPage.svelte"),
  [EXPLORE_ROUTE]: () => import("./ExplorePage.svelte"),
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

const { p, navigate, isActive, route } = createRouter(routes);
export { Router } from "sv-router";

const addressFollowers = new Set<(address: Address) => void>();

/**
 * Hear every address from now on — the one the app opens on, a typed URL,
 * back and forward, a link the router follows, and the app's own navigation —
 * and return the way to stop. This is the address's path, which never asks
 * (ADR-0002 decision 32), so the app hands over the session's `setAddress`,
 * and after an in-app switch the session finds the model already current.
 * The app follows it from before the router loads the first address, so that
 * address is heard too, and heard before any page exists.
 */
export function followAddress(onAddress: (address: Address) => void): () => void {
  addressFollowers.add(onAddress);
  return () => {
    addressFollowers.delete(onAddress);
  };
}

/**
 * The router's after-load hook, run once the address has moved and the route's
 * params are set, and before the page it loaded is drawn. An address that
 * names no model opens the default model on the Standard page, handed on here
 * so the page drawn meanwhile has a session, and is corrected to say so. The
 * correction happens here rather than before it loads, because only now are
 * its params known; it is one more navigation, whose own run of this hook
 * hands the same address on again.
 */
function passAddressOn(): void {
  const address = addressFromRoute();
  const handedOn = address ?? { page: page.standard, model: defaultModel() };
  for (const onAddress of addressFollowers) {
    onAddress(handedOn);
  }
  if (!address) {
    redirectTo(handedOn.model);
  }
}

/** The path `address` is written to: Explore's, or else the Standard page's, which throws for a model with no standard. */
export function pathTo(address: Address): string {
  return address.page === page.explore
    ? p(EXPLORE_ROUTE, { params: exploreSegmentsOf(address.model) })
    : p(STANDARD_ROUTE, { params: routeSegmentsOf(address.model) });
}

/**
 * Put `address` in the URL as a new history entry, which is what following a
 * link has always done: back returns to the page and model the person came
 * from. Every in-app switch goes through here, so how a person switched does
 * not change what back does.
 */
export function navigateTo(address: Address): void {
  if (address.page === page.explore) {
    void navigate(EXPLORE_ROUTE, { params: exploreSegmentsOf(address.model) });
    return;
  }
  void navigate(STANDARD_ROUTE, { params: routeSegmentsOf(address.model) });
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
 * with whoever writes the anchor, as the navigation's links do.
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

/** The page and model the current URL names, or `undefined` when it names no model. */
export function addressFromRoute(): Address | undefined {
  const params = route.params;
  const onExplore = isActive(EXPLORE_ROUTE);
  const model = onExplore ? modelByExploreSegment(params.model) : modelBySegment(params.standard, params.model);
  return model && { page: onExplore ? page.explore : page.standard, model };
}
