<!--
  One choice among named options, in groups: the select the Model row draws,
  taken out of `ModelSelect` so every such choice is the same select
  (ADR-0002 decision 76, rule 4). The trigger shows the chosen option's label.
  It decides nothing: a choice is handed straight back, and the select shows
  the option it is given.
-->
<script lang="ts" module>
  /** A group of the select's options, under a heading or none. */
  export interface ChoiceGroup {
    readonly heading?: string;
    readonly options: readonly { readonly key: string; readonly label: string }[];
  }
</script>

<script lang="ts">
  import * as Select from "$lib/ui/primitives/select";

  interface Props {
    /** The trigger's id, for the label that names it. */
    id: string;
    groups: readonly ChoiceGroup[];
    /** The chosen option's key. */
    chosen: string;
    onchoose: (key: string) => void;
    /** The trigger's size: the small one in a row of small controls, such as the chart card's view row. */
    size?: "sm" | "default";
  }

  let { id, groups, chosen, onchoose, size = "default" }: Props = $props();

  const label = $derived(groups.flatMap((group) => group.options).find((option) => option.key === chosen)?.label);
</script>

<!--
  A function binding, not a value plus a change handler: the caller, not the
  select, decides what is chosen, and a choice it declines has to leave the
  select where it was. With a one-way `value` the select would keep the option
  it had offered, disagree with the page behind a dialog, and refuse to offer
  that option a second time.
-->
<Select.Root type="single" bind:value={() => chosen, onchoose}>
  <Select.Trigger {id} {size}>{label}</Select.Trigger>
  <Select.Content>
    <!--
      The options inside a Group, as every generated example has them: the
      group carries the list's inset, and its heading names it to a screen
      reader. Headings are not options, so the keyboard passes over them.
    -->
    {#each groups as group (group)}
      <Select.Group>
        {#if group.heading !== undefined}
          <Select.GroupHeading>{group.heading}</Select.GroupHeading>
        {/if}
        {#each group.options as option (option.key)}
          <Select.Item value={option.key} label={option.label} />
        {/each}
      </Select.Group>
    {/each}
  </Select.Content>
</Select.Root>
