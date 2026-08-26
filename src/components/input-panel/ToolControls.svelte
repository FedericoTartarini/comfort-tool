<svelte:options runes={true} />

<script lang="ts">
  import { Heading, Toggle } from "flowbite-svelte";

  import SearchableSelect from "../SearchableSelect.svelte";
  import { UnitSystem } from "../../models/units";
  import type { ModelId as ModelIdType } from "../../models/comfortModels";
  import type { ToolControlsViewModel } from "../../state/comfortTool/types";

  interface Props {
    tool: ToolControlsViewModel;
  }

  let { tool }: Props = $props();
</script>

<section class="mt-3 grid gap-3" aria-label="Tool controls">
  <div>
    <Heading tag="h6" class="text-eyebrow">Model</Heading>
    <SearchableSelect
      class="mt-1.5"
      items={[...tool.modelOptions]}
      value={tool.selectedModel}
      placeholder="Select model"
      searchPlaceholder="Search model..."
      ariaLabel="Select comfort model"
      onSelect={(val) => tool.onSelectModel(val as ModelIdType)}
    />
  </div>

  <div class="grid gap-3 md:grid-cols-2">
    <fieldset class="min-w-0">
      <legend class="text-eyebrow">Compare</legend>
      <div class="mt-1.5 flex w-full items-center justify-between rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5">
        <span class={`text-xs ${!tool.compareEnabled ? "font-semibold text-stone-900" : "text-stone-500"}`}>Off</span>
        <Toggle
          checked={tool.compareEnabled}
          onchange={(event) => tool.onSetCompareEnabled(event.currentTarget.checked)}
          aria-label="Enable input comparison"
          color="teal"
          size="small"
        />
        <span class={`text-xs ${tool.compareEnabled ? "font-semibold text-stone-900" : "text-stone-500"}`}>On</span>
      </div>
    </fieldset>

    <fieldset class="min-w-0">
      <legend class="text-eyebrow">Units</legend>
      <div class="mt-1.5 flex w-full items-center justify-between rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5">
        <span class={`text-xs ${tool.unitSystem === UnitSystem.SI ? "font-semibold text-stone-900" : "text-stone-500"}`}>SI</span>
        <Toggle
          checked={tool.unitSystem === UnitSystem.IP}
          onchange={tool.onToggleUnitSystem}
          aria-label="Use IP units"
          color="teal"
          size="small"
        />
        <span class={`text-xs ${tool.unitSystem === UnitSystem.IP ? "font-semibold text-stone-900" : "text-stone-500"}`}>IP</span>
      </div>
    </fieldset>
  </div>
</section>
