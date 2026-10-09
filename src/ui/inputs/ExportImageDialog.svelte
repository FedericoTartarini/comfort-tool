<!--
  Export image (ADR-0002 decision 64, rules 2 to 6 and 8): a button that
  opens a dialog asking for a title, a size, a format and whether the Input
  summary and the footer are included, and Download, which builds the summary,
  the footer and the Image of the chart the page shows at that moment and
  closes the dialog. The button is disabled while the page shows no chart. An
  image that cannot be made is the caller's to report.

  The choices are the dialog's own state, in no session and no link: kept
  while the page is shown, at their defaults again once it is mounted anew.
  An edited title stands while the default it replaced is still the default.

  Its look is the generated primitives' it composes, the dialog at the one
  width every dialog has (ADR-0002 decision 67, rule 9); it adds no styling of
  its own.
-->
<script lang="ts">
  import type { ChartSpec } from "$lib/core/charts/chartSpec";
  import type { BandList } from "$lib/core/bands";
  import type { ChartType } from "$lib/core/chartType";
  import {
    defaultImageTitle,
    imageDescription,
    imageFileName,
    imageFooter,
    imageFormat,
    imageSize,
    type ImageFormat,
    type ImageSize,
  } from "$lib/core/image";
  import { inputSummary, type DrawnRun } from "$lib/core/inputSummary";
  import type { RegisteredModel } from "$lib/core/modelDeclaration";
  import type { UnitSystem } from "$lib/core/unitSystem";
  import { copy } from "$lib/text/copy";
  import { downloadImage } from "$lib/ui/charts/plotlyImage";
  import Inline from "$lib/ui/layout/Inline.svelte";
  import Stack from "$lib/ui/layout/Stack.svelte";
  import { Button } from "$lib/ui/primitives/button";
  import { Checkbox } from "$lib/ui/primitives/checkbox";
  import * as Dialog from "$lib/ui/primitives/dialog";
  import { Input } from "$lib/ui/primitives/input";
  import { Label } from "$lib/ui/primitives/label";
  import * as ToggleGroup from "$lib/ui/primitives/toggle-group";

  interface Props {
    /** The chart the page shows, or `null` while it shows none. */
    chart: ChartSpec | null;
    /** The session's model and chart type, which name the default title. */
    model: RegisteredModel;
    chartType: ChartType;
    /** What the Input summary lists: the runs {@link chart} is drawn of, read at Download. */
    runs: readonly DrawnRun[];
    unitSystem: UnitSystem;
    /** The Band list the page paints on {@link chart}, or `null` where it paints the Comfort zones. */
    bands?: BandList | null;
    /** The image could not be made. */
    onfailed: () => void;
  }

  let { chart, model, chartType, runs, unitSystem, bands = null, onfailed }: Props = $props();

  const id = $props.id();
  let open = $state(false);
  // Typing overrides the derived value until the default changes, with the
  // model or the chart type: then the title starts again from the new one.
  let title = $derived(defaultImageTitle(model, chartType));
  // Raw: a size or a format is compared by identity, which a proxy would break.
  let size: ImageSize = $state.raw(imageSize.doubleColumn);
  let format: ImageFormat = $state.raw(imageFormat.png);
  let includesSummaryAndFooter = $state(true);

  async function download(shown: ChartSpec) {
    open = false;
    try {
      const summaryAndFooter = includesSummaryAndFooter
        ? { summary: inputSummary({ model, runs, unitSystem, bands }), footer: imageFooter(new Date()) }
        : null;
      const image = imageDescription({ chart: shown, title, summaryAndFooter, size });
      await downloadImage(image, format, imageFileName(title, size, format));
    } catch {
      onfailed();
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger disabled={chart === null}>
    {#snippet child({ props })}
      <Button {...props} size="sm" variant="outline">{copy.exportImage}</Button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{copy.exportImage}</Dialog.Title>
    </Dialog.Header>
    <Stack gap="4">
      <Stack gap="2">
        <Label for="{id}-title">{copy.imageTitle}</Label>
        <Input id="{id}-title" bind:value={title} />
      </Stack>
      {@render choice("size", copy.imageSize, Object.values(imageSize), size, (chosen) => (size = chosen))}
      {@render choice("format", copy.imageFormat, Object.values(imageFormat), format, (chosen) => (format = chosen))}
      <Inline gap="2" align="center">
        <Checkbox id="{id}-summary-and-footer" bind:checked={includesSummaryAndFooter} />
        <Label for="{id}-summary-and-footer">{copy.imageIncludesSummaryAndFooter}</Label>
      </Inline>
    </Stack>
    <Dialog.Footer>
      <Button disabled={chart === null} onclick={() => chart && download(chart)}>{copy.imageDownload}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!--
  A toggle group (decision 65, rule 6) whose value is the member's position in
  `members`: a toggle group's value is text, and a size or a format is compared
  by identity. A click on the chosen item asks for none (an empty value), which
  the setter ignores, so one member is always chosen.
-->
{#snippet choice<T extends { title: string }>(
  idSuffix: string,
  label: string,
  members: readonly T[],
  chosen: T,
  onchoose: (member: T) => void,
)}
  <Inline gap="2" align="center">
    <span id="{id}-{idSuffix}">{label}</span>
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      aria-labelledby="{id}-{idSuffix}"
      bind:value={
        () => String(members.indexOf(chosen)),
        (value) => {
          if (value !== "") {
            onchoose(members[Number(value)]);
          }
        }
      }
    >
      {#each members as member, index (member)}
        <ToggleGroup.Item value={String(index)}>{member.title}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </Inline>
{/snippet}
