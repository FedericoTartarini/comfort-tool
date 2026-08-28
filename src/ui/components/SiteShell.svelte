<svelte:options runes={true} />

<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button, Drawer } from "flowbite-svelte";
  import {
    CloseOutline,
    IndentOutline,
    OutdentOutline,
  } from "flowbite-svelte-icons";

  import SiteFooter from "./SiteFooter.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import SurfaceSidebar from "./SurfaceSidebar.svelte";
  import type { PointSession } from "../../state/pointSession/types";

  interface NavigationItem {
    label: string;
    path: string;
  }

  interface Props {
    pointSession: PointSession;
    activePath: string;
    showExportLink: boolean;
    homePath: string;
    standardItems: readonly NavigationItem[];
    exploreItem: NavigationItem;
    timeSeriesItem: NavigationItem;
    children: Snippet;
  }

  let {
    pointSession,
    activePath,
    showExportLink,
    homePath,
    standardItems,
    exploreItem,
    timeSeriesItem,
    children,
  }: Props = $props();

  let navigationDrawerHidden = $state(true);
  let navigationCollapsed = $state(false);

  const collapseButtonLabel = $derived(
    navigationCollapsed
      ? "Expand surface navigation"
      : "Collapse surface navigation",
  );
  const railInnerClass = $derived(
    navigationCollapsed ? "sticky top-0 px-2 py-4" : "sticky top-0 p-4",
  );
  const collapseRowClass = $derived(
    navigationCollapsed ? "mb-2 flex justify-center" : "mb-2 flex justify-end",
  );
</script>

<div class="flex min-h-screen flex-col bg-stone-950">
  <SiteHeader
    {pointSession}
    {showExportLink}
    {homePath}
    onOpenNavigation={() => {
      navigationDrawerHidden = false;
    }}
  />

  <div class="flex flex-1 bg-stone-50">
    <div
      id="surface-navigation"
      data-testid="surface-navigation-rail"
      class="surface-nav-rail relative z-20 hidden border-r border-stone-200 bg-white lg:block"
      class:is-collapsed={navigationCollapsed}
    >
      <div class={railInnerClass}>
        <div class={collapseRowClass}>
          <Button
            color="light"
            size="xs"
            class="p-2.5"
            aria-label={collapseButtonLabel}
            aria-expanded={!navigationCollapsed}
            aria-controls="surface-navigation"
            onclick={() => {
              navigationCollapsed = !navigationCollapsed;
            }}
          >
            {#if navigationCollapsed}
              <IndentOutline class="h-5 w-5" />
            {:else}
              <OutdentOutline class="h-5 w-5" />
            {/if}
          </Button>
        </div>
        <SurfaceSidebar
          {activePath}
          {standardItems}
          {exploreItem}
          {timeSeriesItem}
          collapsed={navigationCollapsed}
        />
      </div>
    </div>

    <main class="min-w-0 flex-1 bg-stone-50 p-dashboard">
      {@render children?.()}
    </main>
  </div>

  <Drawer
    bind:hidden={navigationDrawerHidden}
    id="surface-navigation-drawer"
    placement="left"
    width="w-72"
    divClass="z-50 overflow-y-auto bg-white p-4"
    class="lg:hidden"
  >
    <div class="mb-4 flex items-center justify-between border-b border-stone-200 pb-3">
      <p class="text-sm font-semibold text-stone-900">Surfaces</p>
      <Button
        color="light"
        size="xs"
        aria-label="Close surface navigation"
        onclick={() => {
          navigationDrawerHidden = true;
        }}
      >
        <CloseOutline class="h-4 w-4" />
      </Button>
    </div>
    <SurfaceSidebar
      {activePath}
      {standardItems}
      {exploreItem}
      {timeSeriesItem}
      onNavigate={() => {
        navigationDrawerHidden = true;
      }}
    />
  </Drawer>

  <SiteFooter />
</div>

<style>
  .surface-nav-rail {
    width: 15rem;
    flex: 0 0 15rem;
  }

  .surface-nav-rail.is-collapsed {
    width: 4rem;
    flex: 0 0 4rem;
  }
</style>
