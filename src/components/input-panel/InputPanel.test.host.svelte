<svelte:options runes={true} />

<script lang="ts">
  import InputPanel from "./InputPanel.svelte";
  import {
    ModelId,
    type ModelId as ModelIdType,
  } from "../../models/comfortModels";
  import type { ComfortToolController } from "../../state/comfortTool/types";

  interface Props {
    toolState: ComfortToolController;
    allowedModelIds?: readonly ModelIdType[];
  }

  let {
    toolState,
    allowedModelIds = [ModelId.PmvAshrae, ModelId.Utci],
  }: Props = $props();
</script>

<InputPanel
  panel={toolState.selectors.getInputPanelViewModel(
    allowedModelIds,
    (modelId) => toolState.actions.setSelectedModel(modelId),
  )}
/>
