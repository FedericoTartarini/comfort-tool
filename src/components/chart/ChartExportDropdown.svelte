<script lang="ts">
  import { Button, Dropdown, DropdownHeader, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import {
    publicationExportMenuItems,
    type PublicationExportHandler,
  } from "../../services/plotlyExport";

  interface Props {
    triggerId: string;
    label?: string;
    onExport: PublicationExportHandler;
  }

  let {
    triggerId,
    label = "Export",
    onExport,
  }: Props = $props();
</script>

<Button
  id={triggerId}
  color="light"
  pill
  size="xs"
  aria-label="Export chart"
  class="flex items-center"
>
  <span class="max-w-[120px] truncate">{label}</span>
  <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
</Button>

<Dropdown triggeredBy={`#${triggerId}`} class="w-56 shadow-lg">
  <DropdownHeader divider={false} class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
    Export options
  </DropdownHeader>
  {#each publicationExportMenuItems as item}
    <DropdownItem
      class="text-left text-sm text-stone-700"
      onclick={() => onExport(item.format, item.column)}
    >
      {item.label}
    </DropdownItem>
  {/each}
</Dropdown>
