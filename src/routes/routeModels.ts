import { Standard } from "jsthermalcomfort";
import { standardOf, type RegisteredModel } from "$lib/core/modelDeclaration";
import { page, type Address } from "$lib/core/page";
import { isSameStandard, routeSegmentFor, standards, type StandardEntry } from "$lib/core/standard";
import { registeredModels } from "$lib/models";
import type { ModelGroup } from "$lib/ui/inputs/ModelSelect.svelte";

/*
 * Which models the routes and the navigation offer, how a URL names one, and
 * which link is current. Router-free (unlike
 * `navigation.ts`) so it can load under vitest without `sv-router`'s
 * `createRouter`, which needs `IntersectionObserver`; `navigation.ts`
 * re-exports what pages use.
 */

/** Models that belong to a standard, in registry order. */
export function standardModels(): RegisteredModel[] {
  return registeredModels.filter((model) => standardOf(model) !== undefined);
}

/**
 * The navigation's Standard group: one link per standard that has a registered
 * model, in the order the registry first names each, each opening the
 * standard's first registered model on the Standard page (ADR-0002 decisions
 * 57 and 74). A model of another edition of a standard already linked
 * shares its link; the link names the edition of its first model. The
 * link is an address, so it opens the same model whichever model the person
 * is on.
 */
export function standardLinks(
  models: readonly RegisteredModel[] = registeredModels,
): { standard: StandardEntry; address: Address }[] {
  return modelGroupsOf(models).flatMap(({ standard, models: [first] }) =>
    standard ? [{ standard, address: { page: page.standard, model: first } }] : [],
  );
}

/**
 * Whether the navigation marks `link` current at `address`: a standard's link
 * on any model of that standard, of whichever edition, on the Standard page,
 * though it opens the standard's first, and the Explore link on Explore.
 */
export function isCurrentLink(link: Address, address: Address): boolean {
  return (
    link.page === address.page &&
    (link.page !== page.standard || isSameStandard(requireStandard(link.model), requireStandard(address.model)))
  );
}

/**
 * The `aria-current` value `link` carries at `address` (ADR-0002 decision 67,
 * rule 2): `page` on the link whose address is this one, `true` on a link
 * drawn current though following it opens another model, absent otherwise.
 */
export function ariaCurrentOf(link: Address, address: Address): "page" | "true" | undefined {
  if (!isCurrentLink(link, address)) {
    return undefined;
  }
  return link.model === address.model ? "page" : "true";
}

/**
 * What the model select offers at `address`, in registry order (ADR-0002
 * decisions 57 and 74): on the Standard page one group, the open model's
 * standard's; on Explore every registered model, grouped as
 * {@link modelGroupsOf} groups them.
 */
export function modelChoicesOn(
  address: Address,
  models: readonly RegisteredModel[] = registeredModels,
): readonly ModelGroup[] {
  const groups = modelGroupsOf(models);
  if (address.page !== page.standard) {
    return groups;
  }
  const open = requireStandard(address.model);
  return groups.filter(({ standard }) => standard !== undefined && isSameStandard(standard.id, open));
}

/**
 * `models` grouped by standard (ADR-0002 decision 74): one group per
 * standard, of whichever edition, in the order `models` first names each,
 * under the entry of the edition of its first model; then one group of
 * the models with no standard, when there are any.
 */
function modelGroupsOf(models: readonly RegisteredModel[]): ModelGroup[] {
  const groups: { standard: StandardEntry; models: RegisteredModel[] }[] = [];
  const withoutStandard: RegisteredModel[] = [];
  for (const model of models) {
    const id = standardOf(model);
    if (id === undefined) {
      withoutStandard.push(model);
      continue;
    }
    const group = groups.find(({ standard }) => isSameStandard(standard.id, id));
    if (group) {
      group.models.push(model);
      continue;
    }
    const standard = standards.find((entry) => entry.id === id);
    if (!standard) {
      throw new Error(`No entry declared for standard "${id}"`);
    }
    groups.push({ standard, models: [model] });
  }
  return withoutStandard.length > 0 ? [...groups, { standard: undefined, models: withoutStandard }] : groups;
}

export function defaultModel(): RegisteredModel {
  const model = standardModels()[0];
  if (!model) {
    throw new Error("No registered model belongs to a standard");
  }
  return model;
}

/** `standardOf(model)`, or throws when the model has none (an Explore-only model has no Standard page). */
export function requireStandard(model: RegisteredModel): Standard {
  const standard = standardOf(model);
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
 * model of either must be found by the address it produces. A
 * standard-less model has no Standard page and so is never found.
 */
export function modelBySegment(
  standardSegment: string | undefined,
  modelSegment: string | undefined,
  models: readonly RegisteredModel[] = registeredModels,
): RegisteredModel | undefined {
  return models.find((model) => {
    if (standardOf(model) === undefined) {
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
