<svelte:options runes={true} />

<script lang="ts">
  import InputPanel from "./InputPanel.svelte";
  import {
    ModelId,
    type ModelId as ModelIdType,
  } from "../../../catalog/modelIds";
  import type { PointSession } from "../../../state/pointSession/types";

  interface Props {
    session: PointSession;
    allowedModelIds?: readonly ModelIdType[];
  }

  let {
    session,
    allowedModelIds = [ModelId.PmvAshrae, ModelId.Utci],
  }: Props = $props();

  $effect(() => {
    session.actions.setAllowedModelIds(allowedModelIds);
    session.bindSelectModel((modelId) => {
      session.actions.setSelectedModel(modelId);
    });
  });
</script>

<InputPanel panel={session.inputPanel} />
