<!--
  The model select: the models the page offers, in their groups, the current
  one chosen. It decides nothing — a choice is handed straight back, and the
  select shows the model it is given.
-->
<script lang="ts" module>
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { StandardEntry } from "$lib/core/standard";

  /**
   * One group of the select (ADR-0002 decision 74, rule 4): a standard's
   * models under the entry that names it, or the models of none under
   * `undefined`.
   */
  export interface ModelGroup {
    readonly standard: StandardEntry | undefined;
    readonly models: readonly RegisteredModel[];
  }
</script>

<script lang="ts">
  import { copy } from "$lib/text/copy";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import { Label } from "$lib/ui/primitives/label";
  import * as Select from "$lib/ui/primitives/select";

  interface Props {
    /**
     * What the select lists, in its order: each group under its standard's
     * name, or the copy's heading for the models with none; one group under
     * no heading.
     */
    choices: readonly ModelGroup[];
    /** The session's current model, which `choices` holds. */
    model: RegisteredModel;
    onchoose: (model: RegisteredModel) => void;
  }

  let { choices, model, onchoose }: Props = $props();

  const id = $props.id();

  // An item's value is its position here, across the groups.
  const models = $derived(choices.flatMap((group) => group.models));
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
    bind:value={() => String(models.indexOf(model)), (value) => onchoose(models[Number(value)])}
  >
    <Select.Trigger id="{id}-model">{model.info.label}</Select.Trigger>
    <Select.Content>
      <!--
        The items inside a Group, as every generated example has them: the
        group carries the list's inset, and its heading names it to a screen
        reader. Headings are not items, so the keyboard passes over them.
      -->
      {#each choices as group (group.standard)}
        <Select.Group>
          {#if choices.length > 1}
            <Select.GroupHeading>{group.standard?.displayName ?? copy.otherModels}</Select.GroupHeading>
          {/if}
          {#each group.models as choice (choice)}
            <Select.Item value={String(models.indexOf(choice))} label={choice.info.label} />
          {/each}
        </Select.Group>
      {/each}
    </Select.Content>
  </Select.Root>
</Inline>
