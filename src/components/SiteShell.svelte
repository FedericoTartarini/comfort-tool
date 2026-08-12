<svelte:options runes={true} />

<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button, Drawer } from "flowbite-svelte";
  import { CloseOutline } from "flowbite-svelte-icons";

  import SiteFooter from "./SiteFooter.svelte";
  import SiteHeader from "./SiteHeader.svelte";
  import WorkspaceSidebar from "./WorkspaceSidebar.svelte";
  import type { ComfortToolController } from "../state/comfortTool/types";

  interface NavigationItem {
    label: string;
    path: string;
  }

  interface Props {
    toolState: ComfortToolController;
    activePath: string;
    showExportLink: boolean;
    homePath: string;
    standardItems: readonly NavigationItem[];
    exploreItem: NavigationItem;
    timeSeriesItem: NavigationItem;
    children: Snippet;
  }

  let {
    toolState,
    activePath,
    showExportLink,
    homePath,
    standardItems,
    exploreItem,
    timeSeriesItem,
    children,
  }: Props = $props();

  let navigationDrawerHidden = $state(true);
</script>

<div class="flex min-h-screen flex-col bg-stone-950">
  <SiteHeader
    {toolState}
    {showExportLink}
    {homePath}
    onOpenNavigation={() => {
      navigationDrawerHidden = false;
    }}
  />

  <div class="flex flex-1 bg-stone-50">
    <div class="hidden w-60 shrink-0 border-r border-stone-200 bg-white lg:block">
      <div class="sticky top-0 p-4">
        <WorkspaceSidebar
          {activePath}
          {standardItems}
          {exploreItem}
          {timeSeriesItem}
        />
      </div>
    </div>

    <main class="min-w-0 flex-1 bg-stone-50">
      {@render children?.()}
    </main>
  </div>

  <Drawer
    bind:hidden={navigationDrawerHidden}
    id="workspace-navigation-drawer"
    placement="left"
    width="w-72"
    divClass="z-50 overflow-y-auto bg-white p-4"
    class="lg:hidden"
  >
    <div class="mb-4 flex items-center justify-between border-b border-stone-200 pb-3">
      <p class="text-sm font-semibold text-stone-900">Workspaces</p>
      <Button
        color="light"
        size="xs"
        aria-label="Close workspace navigation"
        onclick={() => {
          navigationDrawerHidden = true;
        }}
      >
        <CloseOutline class="h-4 w-4" />
      </Button>
    </div>
    <WorkspaceSidebar
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
