<!--
  The menu button beside the label of a row that can be entered in another
  mode: named for the entry group, it lists every mode of the group, the
  current one checked, each by its quantities with a line on what is held or
  follows when another input changes (ADR-0002 decision 72). A choice is the session's and converts every slot
  (decision 51); the menu shows the mode it is given.
-->
<script module lang="ts">
  import type { Session } from "$lib/state/session.svelte";

  /** The session's entry-mode setters, one per group. */
  export type EntryModeSetters = Pick<Session, "setTemperatureMode" | "setHumidityMode" | "setAirSpeedMode" | "setClothingMode">;
</script>

<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import type { Quantity } from "$lib/core/quantities";
  import type { RowEntryGroup } from "$lib/core/slot";
  import { copy, type EntryModeId } from "$lib/text/copy";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import * as DropdownMenu from "$lib/ui/primitives/dropdown-menu";

  interface Props {
    group: RowEntryGroup;
    setters: EntryModeSetters;
  }

  let { group, setters }: Props = $props();

  /** The button's visible text and so its whole accessible name (decision 72, rule 1). */
  const groupNames = {
    temperature: copy.temperatureGroup,
    humidity: copy.humidityGroup,
    airSpeed: copy.airSpeedGroup,
    clothing: copy.clothingGroup,
  } satisfies Record<RowEntryGroup["field"], string>;

  /** Each mode's quantities, in the group's order: the rows a choice puts on the panel. */
  const choices = $derived<readonly { quantities: readonly Quantity[]; id: string }[]>(
    group.field === "humidity"
      ? group.modes.map((mode) => ({ quantities: [mode.quantity], id: mode.id }))
      : group.modes.map((mode) => ({ quantities: mode.panel, id: mode.id })),
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

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="sm">
        {groupNames[group.field]}
        <ChevronDownIcon data-icon="inline-end" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start">
    <!-- A function binding, as the model select's: the session, not the menu, decides which mode is current. -->
    <DropdownMenu.RadioGroup bind:value={() => String(currentIndex), (value) => choose(Number(value))}>
      {#each choices as choice, index (choice.id)}
        {@const name = copy.entryModeChoice(choice.quantities.map((quantity) => quantity.label))}
        <DropdownMenu.RadioItem value={String(index)} textValue={name} closeOnSelect>
          <Stack gap="1">
            <span>{name}</span>
            <!-- A mode's `id` is typed `string` on its interface; every mode a group lists is from core's mode
                 tables, whose ids `EntryModeId` is the union of. -->
            <span class="caption">{copy.entryModeDescriptions[choice.id as EntryModeId]}</span>
          </Stack>
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
