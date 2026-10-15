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
  import ChoiceSelect from "./ChoiceSelect.svelte";

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

  // An option's key is its position here, across the groups.
  const models = $derived(choices.flatMap((group) => group.models));

  const groups = $derived(
    choices.map((group) => ({
      heading: choices.length > 1 ? (group.standard?.displayName ?? copy.otherModels) : undefined,
      options: group.models.map((choice) => ({ key: String(models.indexOf(choice)), label: choice.info.label })),
    })),
  );
</script>

<Inline gap="2" align="center">
  <Label for="{id}-model">{copy.model}</Label>
  <!-- The session, not the select, decides which model is current: a switch the person declines leaves it where it was. -->
  <ChoiceSelect
    id="{id}-model"
    {groups}
    chosen={String(models.indexOf(model))}
    onchoose={(key) => onchoose(models[Number(key)])}
  />
</Inline>
