<script lang="ts">
  import { Button, Dropdown, DropdownHeader, DropdownItem } from "flowbite-svelte";
  import { ChevronDownOutline } from "flowbite-svelte-icons";
  import type {
    ModelOutput,
    ModelOutputKey,
  } from "../../catalog/modelCapabilities";

  interface Props {
    idPrefix: string;
    outputs: readonly ModelOutput[];
    selectedOutput: ModelOutputKey;
    onSelect: (outputKey: ModelOutputKey) => void;
  }

  let { idPrefix, outputs, selectedOutput, onSelect }: Props = $props();

  const triggerId = $derived(`${idPrefix}-output-trigger`);
  const selectedLabel = $derived(
    outputs.find(({ key }) => key === selectedOutput)?.label ?? "Output",
  );
</script>

<span class="ml-2 text-xs font-medium text-stone-500">Output:</span>
<Button
  id={triggerId}
  color="light"
  pill
  size="xs"
  aria-label="Select chart output"
  class="flex items-center text-stone-700"
>
  <span class="max-w-[120px] truncate">{selectedLabel}</span>
  <ChevronDownOutline class="ms-1 h-3 w-3 flex-shrink-0" strokeWidth="2" />
</Button>
<Dropdown triggeredBy={`#${triggerId}`} class="w-52 shadow-lg">
  <DropdownHeader
    slot="header"
    divider={false}
    class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500"
  >
    Select Chart Output
  </DropdownHeader>
  {#each outputs as output}
    <DropdownItem
      onclick={() => onSelect(output.key)}
      disabled={selectedOutput === output.key}
      class="text-left"
    >
      <span
        class={selectedOutput === output.key
          ? "font-bold text-teal-700"
          : "text-stone-700"}
      >
        {output.label}
      </span>
    </DropdownItem>
  {/each}
</Dropdown>
