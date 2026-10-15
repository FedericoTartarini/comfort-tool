<!--
  A popover's list of named entries, each ending in its value where it has
  one: the list a row's menu opens, taken out of `RowMenuButton` so every such
  list is the same list (ADR-0002 decision 76, rule 4). Searchable where the
  caller gives the search's words. It sits inside the caller's `Popover.Root`,
  after its trigger, and hands the chosen entry's key back.
-->
<script lang="ts" module>
  /** One entry: its label, and its value as shown, where it has one. */
  export interface ValueListItem {
    readonly key: string;
    readonly label: string;
    readonly value?: string;
  }

  /** A group of entries, under a heading or none; an empty group is not drawn. */
  export interface ValueListGroup {
    readonly heading?: string;
    readonly items: readonly ValueListItem[];
  }
</script>

<script lang="ts">
  import * as Command from "$lib/ui/primitives/command";
  import * as Popover from "$lib/ui/primitives/popover";

  interface Props {
    groups: readonly ValueListGroup[];
    /** The search box's placeholder and the words for no match; no search box without them. */
    search?: { readonly placeholder: string; readonly empty: string };
    /** Which edge of the trigger the list stands at, its centre where none is given. */
    align?: "start" | "center";
    onpick: (key: string) => void;
  }

  let { groups, search, align, onpick }: Props = $props();
</script>

<Popover.Content class="list-popover" {align}>
  <!--
    No initial scroll: on mount the list scrolls its first item into view
    while the popover is still unpositioned far above the page, which
    scrolled the whole window to the top.
  -->
  <Command.Root disableInitialScroll>
    {#if search}
      <Command.Input placeholder={search.placeholder} />
    {/if}
    <Command.List>
      {#if search}
        <Command.Empty>{search.empty}</Command.Empty>
      {/if}
      <!-- The items inside a Group, as every generated example has them: the group's inset parts them from the search box. -->
      {#each groups as group (group)}
        {#if group.items.length > 0}
          <Command.Group heading={group.heading}>
            {#each group.items as item (item.key)}
              <Command.Item value={item.label} onSelect={() => onpick(item.key)}>
                {#if item.value === undefined}
                  {item.label}
                {:else}
                  <span>{item.label}</span>
                  <span class="item-value">{item.value}</span>
                {/if}
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}
      {/each}
    </Command.List>
  </Command.Root>
</Popover.Content>
