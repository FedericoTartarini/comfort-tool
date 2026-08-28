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
    collapsed?: boolean;
    onNavigate?: () => void;
  }

  let {
    activePath,
    standardItems,
    exploreItem,
    timeSeriesItem,
    collapsed = false,
    onNavigate = () => {},
  }: Props = $props();

  let standardOpen = $state(true);

  const iconClass = "h-5 w-5 shrink-0 text-stone-500";
  const activeClass = "flex items-center rounded-lg bg-sky-50 p-2.5 text-sm font-semibold text-sky-800 ring-1 ring-inset ring-sky-200";
  const nonActiveClass = "flex items-center rounded-lg p-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950";
  const collapsedIconActiveClass = "flex items-center justify-center rounded-lg bg-sky-50 p-2.5 text-sky-800 ring-1 ring-inset ring-sky-200";
  const collapsedIconClass = "flex items-center justify-center rounded-lg p-2.5 text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950";
  const collapsedItemClass = "justify-center p-2.5";

  const activeStandardItem = $derived(
    standardItems.find((item) => item.path === activePath),
  );
  const isStandardActive = $derived(activeStandardItem !== undefined);
  const standardHref = $derived(activeStandardItem?.path ?? standardItems[0]?.path ?? "/");
  const collapsedStandardClass = $derived(
    isStandardActive ? collapsedIconActiveClass : collapsedIconClass,
  );
</script>

{#snippet standardLinks()}
  {#each standardItems as definition (definition.path)}
    <SidebarItem
      href={definition.path}
      label={definition.label}
      aria-current={activePath === definition.path ? "page" : undefined}
      on:click={onNavigate}
    />
  {/each}
{/snippet}

<Sidebar
  activeUrl={activePath}
  asideClass="w-full"
  {activeClass}
  {nonActiveClass}
  ariaLabel="Surface navigation"
  class="bg-white"
>
  {#if collapsed}
    <ul class="space-y-1">
      <li class="group relative">
        <a
          href={standardHref}
          class={collapsedStandardClass}
          title="Standard"
          aria-label="Standard"
          aria-current={isStandardActive ? "page" : undefined}
          onclick={onNavigate}
        >
          <BookOpenOutline class={iconClass} />
        </a>
        <div
          class="pointer-events-none absolute start-full top-0 z-30 ps-1 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
          <ul class="w-44 space-y-1 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
            {@render standardLinks()}
          </ul>
        </div>
      </li>

      <SidebarItem
        href={exploreItem.path}
        label={exploreItem.label}
        class={collapsedItemClass}
        spanClass="hidden"
        title={exploreItem.label}
        aria-label={exploreItem.label}
        aria-current={activePath === exploreItem.path ? "page" : undefined}
        on:click={onNavigate}
      >
        <FlaskOutline slot="icon" class={iconClass} />
      </SidebarItem>

      <SidebarItem
        href={timeSeriesItem.path}
        label={timeSeriesItem.label}
        class={collapsedItemClass}
        spanClass="hidden"
        title={timeSeriesItem.label}
        aria-label={timeSeriesItem.label}
        aria-current={activePath === timeSeriesItem.path ? "page" : undefined}
        on:click={onNavigate}
      >
        <ChartLineUpOutline slot="icon" class={iconClass} />
      </SidebarItem>
    </ul>
  {:else}
    <SidebarGroup class="space-y-1">
      <SidebarDropdownWrapper
        label="Standard"
        bind:isOpen={standardOpen}
        btnClass="flex w-full items-center rounded-lg p-2.5 text-sm font-semibold text-stone-900 transition-colors hover:bg-stone-100"
        spanClass="ms-3 flex-1 text-left"
        ulClass="mt-1 space-y-1 ps-4"
      >
        <BookOpenOutline slot="icon" class={iconClass} />
        {@render standardLinks()}
      </SidebarDropdownWrapper>

      <SidebarItem
        href={exploreItem.path}
        label={exploreItem.label}
        aria-current={activePath === exploreItem.path ? "page" : undefined}
        on:click={onNavigate}
      >
        <FlaskOutline slot="icon" class={iconClass} />
      </SidebarItem>

      <SidebarItem
        href={timeSeriesItem.path}
        label={timeSeriesItem.label}
        aria-current={activePath === timeSeriesItem.path ? "page" : undefined}
        on:click={onNavigate}
      >
        <ChartLineUpOutline slot="icon" class={iconClass} />
      </SidebarItem>
    </SidebarGroup>
  {/if}
</Sidebar>
