<svelte:options runes={true} />

<script lang="ts">
  import { Heading, Toggle } from "flowbite-svelte";

  import SearchableSelect from "../SearchableSelect.svelte";
  import { comfortModelMetaById } from "../../state/comfortTool/modelConfigs";
  import { UnitSystem } from "../../models/units";
  import type { ComfortToolController } from "../../state/comfortTool/types";
  import type { ComfortModel as ComfortModelType } from "../../models/comfortModels";

  interface Props {
    toolState: ComfortToolController;
    allowedModelIds: readonly ComfortModelType[];
    onSelectModel: (modelId: ComfortModelType) => void;
  }

  let {
    toolState,
    allowedModelIds,
    onSelectModel,
  }: Props = $props();

  const modelOptions = $derived(allowedModelIds.map((modelId) => ({
    name: comfortModelMetaById[modelId].label,
    value: modelId,
    description: comfortModelMetaById[modelId].description,
  })));
</script>

<section class="mt-3 grid gap-3" aria-label="Tool controls">
  <div>
    <Heading tag="h6" class="text-eyebrow">Model</Heading>
    <SearchableSelect
      class="mt-1.5"
      items={modelOptions}
      value={toolState.state.ui.selectedModel}
      placeholder="Select model"
      searchPlaceholder="Search model..."
      ariaLabel="Select comfort model"
      onSelect={(val) => onSelectModel(val as ComfortModelType)}
    />
  </div>

  <div class="grid gap-3 md:grid-cols-2">
    <fieldset class="min-w-0">
      <legend class="text-eyebrow">Compare</legend>
      <div class="mt-1.5 flex w-full items-center justify-between rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5">
        <span class={`text-xs ${!toolState.state.ui.compareEnabled ? "font-semibold text-stone-900" : "text-stone-500"}`}>Off</span>
        <Toggle
          checked={toolState.state.ui.compareEnabled}
          onchange={(event) => toolState.actions.setCompareEnabled(event.currentTarget.checked)}
          aria-label="Enable input comparison"
          color="teal"
          size="small"
        />
        <span class={`text-xs ${toolState.state.ui.compareEnabled ? "font-semibold text-stone-900" : "text-stone-500"}`}>On</span>
      </div>
    </fieldset>

    <fieldset class="min-w-0">
      <legend class="text-eyebrow">Units</legend>
      <div class="mt-1.5 flex w-full items-center justify-between rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5">
        <span class={`text-xs ${toolState.state.ui.unitSystem === UnitSystem.SI ? "font-semibold text-stone-900" : "text-stone-500"}`}>SI</span>
        <Toggle
          checked={toolState.state.ui.unitSystem === UnitSystem.IP}
          onchange={toolState.actions.toggleUnitSystem}
          aria-label="Use IP units"
          color="teal"
          size="small"
        />
        <span class={`text-xs ${toolState.state.ui.unitSystem === UnitSystem.IP ? "font-semibold text-stone-900" : "text-stone-500"}`}>IP</span>
      </div>
    </fieldset>
  </div>
</section>
