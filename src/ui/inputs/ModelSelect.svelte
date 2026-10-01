<!--
  The model select: the models the page offers, the current one chosen. It
  decides nothing — a choice is handed straight back, and the select shows the
  model it is given.
-->
<script lang="ts">
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import * as Select from "$lib/ui/primitives/select";

  interface Props {
    /** What the select lists, in its order. */
    choices: readonly RegisteredModel[];
    /** The session's current model, which `choices` holds. */
    model: RegisteredModel;
    onchoose: (model: RegisteredModel) => void;
  }

  let { choices, model, onchoose }: Props = $props();

  const id = $props.id();
</script>

<Inline gap="2" align="center">
  <Label for="{id}-model">{copy.model}</Label>
  <!--
    A function binding, not a value plus a change handler: the session, not
    the select, decides which model is current, and a switch the person
    declines has to leave the select where it was. With a one-way `value` the
    select would keep the model it had offered, disagree with the page behind
    the dialog, and refuse to offer that model a second time.
  -->
  <Select.Root
    type="single"
    bind:value={() => String(choices.indexOf(model)), (value) => onchoose(choices[Number(value)])}
  >
    <Select.Trigger id="{id}-model">{model.info.label}</Select.Trigger>
    <Select.Content>
      {#each choices as choice, index (choice)}
        <Select.Item value={String(index)} label={choice.info.label} />
      {/each}
    </Select.Content>
  </Select.Root>
</Inline>
