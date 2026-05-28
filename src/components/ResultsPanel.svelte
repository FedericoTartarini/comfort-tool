<script lang="ts">
  /**
   * @component
   * ResultsPanel.svelte
   *
   * Renders a compact tabular display of thermal comfort model results for all visible inputs.
   * Each result section is split into a primary value column and a secondary detail column so
   * model outputs never stack into two lines inside one cell.
   */
  import { Card } from "flowbite-svelte";
  import { inputDisplayMetaById } from "../models/inputSlotPresentation";
  import type { InputId as InputIdType } from "../models/inputSlots";
  import type { ResultSectionViewModel } from "../state/comfortTool/types";

  interface Props {
    activeInputId: InputIdType;
    visibleInputIds: InputIdType[];
    resultSections: ResultSectionViewModel[];
    errorMessage: string;
    isLoading: boolean;
    embedded?: boolean;
  }

  let {
    activeInputId,
    visibleInputIds,
    resultSections,
    errorMessage,
    isLoading,
    embedded = false,
  }: Props = $props();

  type ResultGroupViewModel = {
    group: string;
    sections: ResultSectionViewModel[];
  };

  const groupedSections = $derived.by<ResultGroupViewModel[]>(() => {
    const groups = new Map<string, ResultSectionViewModel[]>();

    for (const section of resultSections) {
      const groupKey = section.group ?? "default";
      const current = groups.get(groupKey);

      if (current) {
        current.push(section);
      } else {
        groups.set(groupKey, [section]);
      }
    }

    return Array.from(groups.entries()).map(([group, sections]) => ({
      group,
      sections,
    }));
  });

  function hasSectionDetail(section: ResultSectionViewModel): boolean {
    return visibleInputIds.some((inputId) => !!section.valuesByInput[inputId]?.subtext);
  }

  function getSectionWidthWeight(section: ResultSectionViewModel): number {
    let weight = hasSectionDetail(section) ? 1.25 : 0.8;

    if (section.title.length > 14) {
      weight += 0.2;
    }

    const hasLongValue = visibleInputIds.some((inputId) => {
      const cell = section.valuesByInput[inputId];
      return !!cell && (cell.text.length > 14 || (cell.subtext?.length ?? 0) > 14);
    });

    if (hasLongValue) {
      weight += 0.2;
    }

    return Math.min(weight, 1.6);
  }

  function getGridTemplateColumns(sections: ResultSectionViewModel[]): string {
    if (sections.length <= 0) {
      return "minmax(max-content, 0.7fr)";
    }

    const resultColumns = sections
      .map((section) => `minmax(max-content, ${getSectionWidthWeight(section)}fr)`)
      .join(" ");

    return `minmax(max-content, 0.7fr) ${resultColumns}`;
  }

  const headerTextClass = "text-xs";
  const bodyTextClass = "text-sm";
  const secondaryTextClass = "text-xs";
</script>

{#snippet table(sections: ResultSectionViewModel[])}
  {@const gridTemplateColumns = getGridTemplateColumns(sections)}

  <div class="w-full overflow-x-auto rounded-lg bg-transparent">
    <div class="w-full min-w-max">
      <div
        class="grid border-b border-stone-200"
        style={`grid-template-columns: ${gridTemplateColumns};`}
      >
        <div class={`min-w-0 px-2 py-1 ${headerTextClass} font-semibold uppercase leading-none text-stone-500`}>
          <span class="block truncate" title="Input">Input</span>
        </div>
        {#each sections as section, sectionIndex}
          <div
            class={`min-w-0 px-2 py-1 ${headerTextClass} font-semibold uppercase leading-none text-stone-500 ${
              sectionIndex === 0 ? "" : "border-l border-stone-200"
            }`}
          >
            <span class="block truncate" title={section.title}>{section.title}</span>
          </div>
        {/each}
      </div>

      <div class="divide-y divide-stone-200">
        {#each visibleInputIds as inputId}
          {@const inputMeta = inputDisplayMetaById[inputId]}
          <div
            class="grid"
            style={`grid-template-columns: ${gridTemplateColumns};`}
          >
            <div
              class={`min-w-0 px-2 py-1 ${bodyTextClass} font-medium leading-none ${inputMeta.accentClass}`}
            >
              <span class="block truncate" title={inputMeta.label}>{inputMeta.label}</span>
            </div>
            {#each sections as section, sectionIndex}
              {@const cell = section.valuesByInput[inputId]}
              <div
                class={`min-w-0 px-2 py-1 ${
                  sectionIndex === 0 ? "" : "border-l border-stone-200"
                }`}
                style={cell?.color ? `color: ${cell.color}` : ""}
              >
                <div class={`flex min-w-0 items-center justify-between gap-3 leading-none ${cell ? "" : "text-stone-400"}`}>
                  <div class="min-w-0">
                    {#if cell}
                      <span class={`block truncate font-medium ${bodyTextClass}`} title={cell.text}>
                        {cell.text}
                      </span>
                    {:else}
                      <span class={`block truncate ${bodyTextClass}`} title={isLoading ? "Loading..." : "No result"}>
                        {isLoading ? "Loading..." : "No result"}
                      </span>
                    {/if}
                  </div>
                  <div class={`min-w-0 shrink-0 text-right ${secondaryTextClass} text-stone-500`}>
                    <span class="block truncate" title={cell?.subtext ?? ""}>
                      {cell?.subtext ?? ""}
                    </span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/snippet}

{#snippet content()}
  <div class="flex flex-col gap-3">
    {#each groupedSections as groupBlock}
      <div class="flex flex-col gap-1.5">
        {#if groupBlock.group !== "default"}
          <h3 class={`px-1 ${secondaryTextClass} font-semibold uppercase text-stone-400`}>
            {groupBlock.group}
          </h3>
        {/if}
        {@render table(groupBlock.sections)}
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
