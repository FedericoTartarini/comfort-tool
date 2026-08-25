<svelte:options runes={true} />

<script lang="ts">
  import InputPanel from "./InputPanel.svelte";
  import {
    ComfortModel,
    type ComfortModel as ComfortModelType,
  } from "../../models/comfortModels";
  import type { ComfortToolController } from "../../state/comfortTool/types";

  interface Props {
    toolState: ComfortToolController;
    allowedModelIds?: readonly ComfortModelType[];
  }

  let {
    toolState,
    allowedModelIds = [ComfortModel.PmvAshrae, ComfortModel.Utci],
  }: Props = $props();
</script>

<InputPanel
  panel={toolState.selectors.getInputPanelViewModel(
    allowedModelIds,
    (modelId) => toolState.actions.setSelectedModel(modelId),
  )}
/>
