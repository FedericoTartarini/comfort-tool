<script lang="ts">
  import {
    Sidebar,
    SidebarDropdownWrapper,
    SidebarGroup,
    SidebarItem,
  } from "flowbite-svelte";
  import {
    BookOpenOutline,
    ChartLineUpOutline,
    FlaskOutline,
  } from "flowbite-svelte-icons";

  interface NavigationItem {
    label: string;
    path: string;
  }

  interface Props {
    activePath: string;
    standardItems: readonly NavigationItem[];
    exploreItem: NavigationItem;
    timeSeriesItem: NavigationItem;
    onNavigate?: () => void;
  }

  let {
    activePath,
    standardItems,
    exploreItem,
    timeSeriesItem,
    onNavigate = () => {},
  }: Props = $props();

  let standardOpen = $state(true);

  const activeClass = "flex items-center rounded-lg bg-sky-50 p-2.5 text-sm font-semibold text-sky-800 ring-1 ring-inset ring-sky-200";
  const nonActiveClass = "flex items-center rounded-lg p-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950";
</script>

<Sidebar
  activeUrl={activePath}
  asideClass="w-full"
  {activeClass}
  {nonActiveClass}
  ariaLabel="Workspace navigation"
  class="bg-white"
>
  <SidebarGroup class="space-y-1">
    <SidebarDropdownWrapper
      label="Standard"
      bind:isOpen={standardOpen}
      btnClass="flex w-full items-center rounded-lg p-2.5 text-sm font-semibold text-stone-900 transition-colors hover:bg-stone-100"
      spanClass="ms-3 flex-1 text-left"
      ulClass="mt-1 space-y-1 ps-4"
    >
      <BookOpenOutline slot="icon" class="h-5 w-5 text-stone-500" />
      {#each standardItems as definition}
        <SidebarItem
          href={definition.path}
          label={definition.label}
          aria-current={activePath === definition.path ? "page" : undefined}
          on:click={onNavigate}
        />
      {/each}
    </SidebarDropdownWrapper>

    <SidebarItem
      href={exploreItem.path}
      label={exploreItem.label}
      aria-current={activePath === exploreItem.path ? "page" : undefined}
      on:click={onNavigate}
    >
      <FlaskOutline slot="icon" class="h-5 w-5 text-stone-500" />
    </SidebarItem>

    <SidebarItem
      href={timeSeriesItem.path}
      label={timeSeriesItem.label}
      aria-current={activePath === timeSeriesItem.path ? "page" : undefined}
      on:click={onNavigate}
    >
      <ChartLineUpOutline slot="icon" class="h-5 w-5 text-stone-500" />
    </SidebarItem>
  </SidebarGroup>
</Sidebar>
