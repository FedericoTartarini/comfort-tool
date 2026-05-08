<script lang="ts">
  import {
    Card,
    Table,
    TableBody,
    TableBodyCell,
    TableBodyRow,
    TableHead,
    TableHeadCell,
  } from "flowbite-svelte";
  import { inputDisplayMetaById } from "../models/inputSlotPresentation";
  import type { InputId as InputIdType } from "../models/inputSlots";
  import type { ResultSectionViewModel } from "../state/comfortTool/types";

  let {
    activeInputId,
    visibleInputIds,
    resultSections,
    errorMessage,
    isLoading,
    embedded = false,
  }: {
    activeInputId: InputIdType;
    visibleInputIds: InputIdType[];
    resultSections: ResultSectionViewModel[];
    errorMessage: string;
    isLoading: boolean;
    embedded?: boolean;
  } = $props();
</script>

{#snippet table(sections: ResultSectionViewModel[])}
  <Table>
    <TableHead>
      <TableHeadCell>Input</TableHeadCell>
      {#each sections as section}
        <TableHeadCell>{section.title}</TableHeadCell>
      {/each}
    </TableHead>
    <TableBody>
      {#each visibleInputIds as inputId}
        <TableBodyRow>
          <TableBodyCell
            class={`font-medium ${inputDisplayMetaById[inputId].accentClass}`}
          >
            {inputDisplayMetaById[inputId].label}
          </TableBodyCell>
          {#each sections as section}
            {@const cell = section.valuesByInput[inputId]}
            <!-- Renders cell with primary text and optional subtext (e.g. status + range) -->
            <TableBodyCell
              class={!cell
                ? "text-stone-400"
                : {
                    success: "text-emerald-700",
                    danger: "text-red-600",
                    warning: "text-orange-500",
                    hiCaution: "text-yellow-500",
                    hiExtremeCaution: "text-yellow-600",
                    hiDanger: "text-orange-500",
                    hiExtremeDanger: "text-red-600",
                    wcSafe: "text-emerald-600",
                    wc30min: "text-amber-500",
                    wc10min: "text-orange-600",
                    wc2min: "text-red-700",
                    pmvCold: "text-violet-600",
                    pmvCool: "text-blue-600",
                    pmvSlightlyCool: "text-blue-400",
                    pmvNeutral: "text-emerald-600",
                    pmvSlightlyWarm: "text-amber-500",
                    pmvWarm: "text-orange-500",
                    pmvHot: "text-red-600",
                    utciExtremeCold: "text-[#0f172a]",
                    utciVeryStrongCold: "text-[#1d4ed8]",
                    utciStrongCold: "text-[#2563eb]",
                    utciModerateCold: "text-[#3b82f6]",
                    utciSlightCold: "text-[#7dd3fc]",
                    utciNoStress: "text-[#34d399]",
                    utciModerateHeat: "text-[#fbbf24]",
                    utciStrongHeat: "text-[#fb923c]",
                    utciVeryStrongHeat: "text-[#f97316]",
                    utciExtremeHeat: "text-[#dc2626]",
                  }[cell.tone] || ""}
            >
              {#if cell}
                <!-- Display the calculated values -->
                <div class="font-medium">{cell.text}</div>
                <!-- Support a primary status label and optional subtext -->
                {#if cell.subtext}
                  <div class="text-[10px] opacity-70 mt-0.5">
                    {cell.subtext}
                  </div>
                {/if}
              {:else}
                <!-- Display loading state when results are being fetched -->
                {isLoading ? "Loading..." : "No result"}
              {/if}
            </TableBodyCell>
          {/each}
        </TableBodyRow>
      {/each}
    </TableBody>
  </Table>
{/snippet}

{#snippet content()}
  {@const groups = Array.from(
    new Set(resultSections.map((s) => s.group ?? "default")),
  )}

  <div class="flex flex-col gap-6">
    {#each groups as group}
      {@const sectionsInGroup = resultSections.filter(
        (s) => (s.group ?? "default") === group,
      )}
      <div class="flex flex-col gap-2">
        {#if group !== "default"}
          <h3
            class="text-[11px] font-bold uppercase tracking-widest text-stone-400 px-1"
          >
            {group}
          </h3>
        {/if}
        {@render table(sectionsInGroup)}
      </div>
    {/each}
  </div>
{/snippet}

{#if embedded}
  {@render content()}
{:else}
  <Card size="none" class="p-3">
    {@render content()}
  </Card>
{/if}
