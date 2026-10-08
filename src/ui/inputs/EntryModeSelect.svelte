<!--
  The label of a row that can be entered in another mode: a select showing
  the entered quantity's label with its unit, which lists the group's modes by
  their quantities (ADR-0002 decision 68). A choice is the session's and
  converts every slot (decision 51); the select shows the mode it is given.
-->
<script module lang="ts">
  import type { Session } from "$lib/state/session.svelte";

  /** The session's entry-mode setters, one per group. */
  export type EntryModeSetters = Pick<Session, "setTemperatureMode" | "setHumidityMode" | "setAirSpeedMode" | "setClothingMode">;
</script>

<script lang="ts">
  import type { Quantity } from "$lib/core/quantities";
  import type { RowEntryGroup } from "$lib/core/slot";
  import { copy } from "$lib/text/copy";
  import * as Select from "$lib/ui/primitives/select";

  interface Props {
    group: RowEntryGroup;
    /** The entered quantity's label with its unit, which the trigger shows. */
    labelText: string;
    setters: EntryModeSetters;
  }

  let { group, labelText, setters }: Props = $props();

  /** The select's accessible name, the group's (decision 68, rule 3). */
  const groupNames = {
    temperature: copy.temperatureInput,
    humidity: copy.humidityInput,
    airSpeed: copy.airSpeedInput,
    clothing: copy.clothingInput,
  } satisfies Record<RowEntryGroup["field"], string>;

  /** Each mode's quantities, in the group's order: the rows a choice puts on the panel. */
  const choices = $derived<readonly (readonly Quantity[])[]>(
    group.field === "humidity" ? group.modes.map((mode) => [mode.quantity]) : group.modes.map((mode) => mode.panel),
  );

  const currentIndex = $derived(group.modes.findIndex((mode) => mode === group.mode));

  function choose(index: number) {
    switch (group.field) {
      case "humidity":
        return setters.setHumidityMode(group.modes[index]);
      case "temperature":
        return setters.setTemperatureMode(group.modes[index]);
      case "airSpeed":
        return setters.setAirSpeedMode(group.modes[index]);
      case "clothing":
        return setters.setClothingMode(group.modes[index]);
    }
  }
</script>

<!-- A function binding, as the model select's: the session, not the select, decides which mode is current. -->
<Select.Root type="single" bind:value={() => String(currentIndex), (value) => choose(Number(value))}>
  <Select.Trigger size="sm" aria-label={groupNames[group.field]}>{labelText}</Select.Trigger>
  <Select.Content>
    <!-- The other modes alone: the trigger already says which mode is entered (decision 68, rule 1). -->
    {#each choices as quantities, index (quantities)}
      {#if index !== currentIndex}
        <Select.Item value={String(index)} label={copy.entryModeChoice(quantities.map((quantity) => quantity.label))} />
      {/if}
    {/each}
  </Select.Content>
</Select.Root>
