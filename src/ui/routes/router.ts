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
import TimeSeriesPage from "../views/TimeSeriesPage.svelte";
import {
  buildCanonicalPathname,
  defaultAppRoute,
  parseAppLocation,
} from "../../state/workspace/routeDefinitions";
import type {
  WorkspaceNavigationCoordinator,
  WorkspaceNavigationTarget,
} from "../../state/workspace/createWorkspaceNavigation";

type DeclaredRouterPath =
  | "/"
  | "/standard"
  | "/explore"
  | "/time-series";

class WorkspaceRouteBlocked extends Error {}

let workspaceNavigation: WorkspaceNavigationCoordinator | null = null;
let clearNavigationBlock: (() => void) | null = null;
let skipNextNavigationBlock = false;

function urlFromHookContext(context: HooksContext): URL {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const search = serializeSearch(context.search) ?? "";
  return new URL(`${context.pathname}${search}${context.hash ?? ""}`, origin);
}

function withTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function shouldReplaceCanonical(canonicalPathname: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const current = parseAppLocation(window.location.pathname);
  const next = parseAppLocation(canonicalPathname);
  if (!current || !next) {
    return true;
  }
  return current.definition.id === next.definition.id;
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
  "/standard": ComfortWorkspaceRoute,
  "/standard/:standard": ComfortWorkspaceRoute,
  "/standard/:standard/:model": ComfortWorkspaceRoute,
  "/explore": ComfortWorkspaceRoute,
  "/explore/:model": ComfortWorkspaceRoute,
  "/time-series": TimeSeriesPage,
  "/time-series/:model": TimeSeriesPage,
  "*path": NotFoundRoute,
  hooks: {
    beforeLoad(context: HooksContext) {
      const targetUrl = urlFromHookContext(context);
      if (context.pathname === "/") {
        targetUrl.pathname = defaultAppRoute.path;
        throw navigateWithCanonicalUrl({ url: targetUrl, replace: true });
      }

      if (workspaceNavigation && !workspaceNavigation.prepareUrl(targetUrl)) {
        throw new WorkspaceRouteBlocked();
      }

      const parsed = parseAppLocation(targetUrl.pathname);
      const canonical = workspaceNavigation
        ? workspaceNavigation.getCanonicalPathname(targetUrl)
        : parsed
          ? buildCanonicalPathname(
            targetUrl.pathname,
            parsed.modelId ?? parsed.definition.defaultModelId ?? defaultAppRoute.defaultModelId,
          )
          : undefined;

      if (canonical && withTrailingSlash(targetUrl.pathname) !== canonical) {
        targetUrl.pathname = canonical;
        throw navigateWithCanonicalUrl({
          url: targetUrl,
          replace: shouldReplaceCanonical(canonical),
        });
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
