import {
  Router,
  blockNavigation,
  createRouter,
  serializeSearch,
  type HooksContext,
  type Navigation,
  type NavigateOptions,
  type Routes,
} from "sv-router";
import ComfortWorkspaceRoute from "./ComfortWorkspaceRoute.svelte";
import NotFoundRoute from "./NotFoundRoute.svelte";
import RootRedirectPage from "../views/RootRedirectPage.svelte";
import TimeSeriesPlaceholderPage from "../views/TimeSeriesPlaceholderPage.svelte";
import {
  defaultAppRoute,
  getAppRouteByPath,
} from "../state/workspace/routeDefinitions";
import type {
  WorkspaceNavigationCoordinator,
  WorkspaceNavigationTarget,
} from "../state/workspace/createWorkspaceNavigation";

type DeclaredRouterPath =
  | "/"
  | "/ASHRAE-55"
  | "/ISO-7730"
  | "/EN-16798-1"
  | "/Explore"
  | "/Time-Series";

class WorkspaceRouteBlocked extends Error {}

let workspaceNavigation: WorkspaceNavigationCoordinator | null = null;
let clearNavigationBlock: (() => void) | null = null;
let skipNextNavigationBlock = false;

function urlFromHookContext(context: HooksContext): URL {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const search = serializeSearch(context.search) ?? "";
  return new URL(`${context.pathname}${search}${context.hash ?? ""}`, origin);
}

function navigateWithCanonicalUrl(
  target: WorkspaceNavigationTarget,
): Promise<Navigation> {
  skipNextNavigationBlock = true;
  const options: NavigateOptions = {
    replace: target.replace,
    search: target.url.search,
    hash: target.url.hash,
  };
  // sv-router omits a final slash from its generated Path type, while the
  // public canonical URLs intentionally retain it. Keep that adaptation here.
  return routerApi.navigate(
    target.url.pathname as DeclaredRouterPath,
    options,
  );
}

const routes = {
  "/": RootRedirectPage,
  "/ASHRAE-55": ComfortWorkspaceRoute,
  "/ISO-7730": ComfortWorkspaceRoute,
  "/EN-16798-1": ComfortWorkspaceRoute,
  "/Explore": ComfortWorkspaceRoute,
  "/Time-Series": TimeSeriesPlaceholderPage,
  "*path": NotFoundRoute,
  hooks: {
    beforeLoad(context: HooksContext) {
      if (context.pathname === "/") {
        const targetUrl = urlFromHookContext(context);
        targetUrl.pathname = defaultAppRoute.path;
        throw navigateWithCanonicalUrl({ url: targetUrl, replace: true });
      }

      const definition = getAppRouteByPath(context.pathname);
      if (definition && context.pathname !== definition.path) {
        const targetUrl = urlFromHookContext(context);
        targetUrl.pathname = definition.path;
        throw navigateWithCanonicalUrl({ url: targetUrl, replace: true });
      }

      const targetUrl = urlFromHookContext(context);
      if (workspaceNavigation && !workspaceNavigation.prepareUrl(targetUrl)) {
        throw new WorkspaceRouteBlocked();
      }
    },
    afterLoad(context: HooksContext) {
      workspaceNavigation?.afterNavigation(urlFromHookContext(context));
    },
  },
} as const satisfies Routes;

const routerApi = createRouter(routes);

export const { route } = routerApi;
export { Router };

export function navigateToUrl(target: WorkspaceNavigationTarget) {
  if (workspaceNavigation && !workspaceNavigation.prepareUrl(target.url)) {
    return;
  }
  void navigateWithCanonicalUrl(target);
}

export function registerWorkspaceNavigation(
  coordinator: WorkspaceNavigationCoordinator,
): () => void {
  workspaceNavigation = coordinator;
  clearNavigationBlock?.();
  clearNavigationBlock = blockNavigation(() => {
    if (skipNextNavigationBlock) {
      skipNextNavigationBlock = false;
      return true;
    }
    if (!workspaceNavigation || typeof window === "undefined") {
      return true;
    }
    return workspaceNavigation.prepareUrl(new URL(window.location.href));
  });

  return () => {
    clearNavigationBlock?.();
    clearNavigationBlock = null;
    if (workspaceNavigation === coordinator) {
      workspaceNavigation = null;
    }
  };
}
