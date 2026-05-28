# Component Review Notes — CBE Thermal Comfort Tool

Delete this file once all items below are resolved.

IMPORTANT: Please note that while below there are some examples that need to be fixed the same logic should be applied throughout the code base Consequently, I recommend that you not only review the files mentioned below and then you call it a day and you think that all the problems are solved but instead I would really appreciate if you can go file by file and try to fix similar errors as those one mentioned below. Here AI is very good because you can explain what you are trying to do and then they can refactor the code based.

---

## The `$props()` pattern (appears in almost every component)

In Svelte 5, `$props()` is the required way to declare component props — it replaces the old `export let`. It cannot be removed. However, the way the type annotation is written makes components with many props very hard to read. The current pattern:

```svelte
let {
  title,
  description,
  chartResult,
  isLoading,
  ...
}: {
  title: string;
  description: string;
  chartResult: PlotlyChartResponseDto | null;
  isLoading: boolean;
  ...
} = $props();
```

Should be written as a named interface above the destructuring:

```svelte
interface Props {
  title: string;
  description: string;
  chartResult: PlotlyChartResponseDto | null;
  isLoading: boolean;
}

let { title, description, chartResult, isLoading }: Props = $props();
```

This separates the shape definition from the destructuring. Both become shorter and easier to read independently. Apply this change to every component — it is especially important in `ChartPanel.svelte`, which has 17 props written inline.

---

## Semantic HTML: wrong elements used as layout containers

### `SiteShell.svelte`

```html
<section class="min-h-screen bg-stone-950 text-stone-950">
  <article class="flex min-h-screen flex-col">
    <SiteHeader />
    <main class="flex-1 bg-stone-50">...</main>
    <SiteFooter />
  </article>
</section>
```

Three problems here:
1. `<section>` and `<article>` are semantic landmark elements — they imply the content inside is a section of a document or a self-contained piece of content. The page shell is neither. Use `<div>` for layout-only wrappers.
2. `min-h-screen` is applied twice — once on `<section>` and once on `<article>`. One of them is redundant.
3. The text color on the outermost element is `text-stone-950` (nearly black) on a `bg-stone-950` (nearly black) background. This is almost certainly a copy-paste error and should be `text-stone-50` or removed.

Simplified:
```html
<div class="flex min-h-screen flex-col bg-stone-950">
  <SiteHeader {toolState} />
  <main class="flex-1 bg-stone-50">
    {@render children?.()}
  </main>
  <SiteFooter />
</div>
```

### `SiteFooter.svelte`

The footer contains a `<header>` element:
```html
<Footer ...>
  <div ...>
    <header class="flex flex-wrap items-center gap-4">
      <FooterBrand ... />
      <Img ... />
    </header>
```

A `<header>` inside a `<footer>` is semantically wrong. The `<header>` element is a landmark and should mark the header of a page or section, not the top of a footer. Replace it with a `<div>`.

The two helper functions `getLinkTarget` and `getLinkRel` are also unnecessary — they are single-expression wrappers. Replace their call sites with the expression directly:
```svelte
<!-- Instead of: -->
target={getLinkTarget(link.external)}
<!-- Use: -->
target={link.external ? "_blank" : undefined}
```

### `SearchableSelect.svelte` and `PresetNumericInput.svelte`

Both components use `<section>` as the outer wrapper and as the listbox container:
```html
<section class="relative w-full ...">   ← outer wrapper
  ...
  <section role="listbox" ...>           ← dropdown panel
```

A custom combobox widget is a form control, not a landmark section. Both should be `<div>`. The `role="listbox"` on the inner one is correct — it just needs to be on a `<div>` instead.

---

## Flowbite: using raw elements where components exist

### `ChartExportMenu.svelte` — raw `<div>` for a dropdown section label

```html
<div class="mt-1 border-t border-stone-100 px-4 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wider">
  Export options
</div>
```

Flowbite Svelte provides `DropdownDivider` and `DropdownHeader` for exactly this. Use them:
```svelte
<DropdownDivider />
<DropdownHeader>Export options</DropdownHeader>
```

### `ChartAxisMenu.svelte` — `<div slot="header">` in two dropdowns

```html
<div slot="header" class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
  Select X Axis
</div>
```

This should use `DropdownHeader`. Replace all three dropdown headers in this file.

### `InputFieldRow.svelte` — arrow characters as icons

```svelte
<span class="text-[10px]">▼</span>
```

This uses a Unicode arrow character as a chevron icon. The project already imports icons from `flowbite-svelte-icons` (see `ChartExportMenu` and `ChartAxisMenu` which use `ChevronDownOutline`). Use the same icon component here for consistency.

---

## Repeated markup that should be a snippet

### `ChartLegend.svelte` — zone color swatch rendered 5 times

The same markup appears once per model:
```html
<div class="flex items-center gap-1.5">
  <div class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
    style="background-color: {zone.color}"></div>
  <span class="text-[11px] font-medium text-stone-500">{zone.label}</span>
</div>
```

And the containing section wrapper is also repeated 5 times. Define a Svelte snippet once:

```svelte
{#snippet legendSection(title: string, zones: Array<{label: string, color: string}>)}
  <div class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-stone-100 pt-4">
    <span class="text-xs font-semibold uppercase tracking-wider text-stone-400">{title}</span>
    <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {#each zones as zone}
        <div class="flex items-center gap-1.5">
          <div class="h-2.5 w-2.5 rounded-full border border-stone-200 shadow-sm"
            style="background-color: {zone.color}"></div>
          <span class="text-[11px] font-medium text-stone-500">{zone.label}</span>
        </div>
      {/each}
    </div>
  </div>
{/snippet}
```

Then each model's legend becomes one line: `{@render legendSection("PMV Zones", pmvZones)}`.

---

## Logic that belongs outside the template

### `ChartPanel.svelte` — complex condition inline in `{#if}`

```svelte
{#if (compareEnabled || ([ChartId.PmvDynamic, ChartId.UtciDynamic, ...] as ChartIdType[]).includes(selectedChart)) && baselineInputId && onSelectBaselineInput}
```

This is hard to read and hides what the condition means. Move it to a `$derived` variable:

```ts
const isDynamicChart = $derived(
  ([ChartId.PmvDynamic, ChartId.UtciDynamic, ChartId.AdaptiveDynamic,
    ChartId.HeatIndexDynamic, ChartId.HumidexDynamic, ChartId.WindChillDynamic
  ] as ChartIdType[]).includes(selectedChart)
);

const showAxisMenu = $derived(
  (compareEnabled || isDynamicChart) && !!baselineInputId && !!onSelectBaselineInput
);
```

Then the template becomes: `{#if showAxisMenu}`.

### `ChartPanel.svelte` — `lockYAxis` is model-specific logic

```ts
const lockYAxis = $derived(
  ([ChartId.HeatIndexDynamic, ChartId.HumidexDynamic, ChartId.WindChillDynamic] as ChartIdType[])
    .includes(selectedChart),
);
```

This hardcodes which chart IDs lock the Y axis. This is model-specific knowledge that does not belong in a generic chart panel. After the main refactor, `lockYAxis` should come from the model config (the model knows whether its dynamic chart supports a free Y axis selection), and `ChartPanel` should receive it as a prop.

---

## Hardcoded IDs that break with multiple instances

### `ChartAxisMenu.svelte`

The buttons use hardcoded IDs:
```svelte
<Button id="chart-baseline-trigger" ...>
<Button id="chart-x-axis-trigger" ...>
<Button id="chart-y-axis-trigger" ...>
```

If `ChartAxisMenu` were ever rendered more than once on the same page, these would produce duplicate element IDs — a browser error. They should be unique, like `InputFieldRow` already does with `advanced-input-${control.id}`. Passing a unique `id` prefix as a prop is the simplest fix.

---

## Missing types

### `InputPanel.svelte`

```ts
function handleApplyClothingValue(inputId, value) {
```

Both parameters are untyped. TypeScript strict mode being off hides this, but it should be:
```ts
function handleApplyClothingValue(inputId: InputIdType, value: number) {
```

---

## Dead code in `PresetNumericInput.svelte`

```ts
function highlightNextOption(direction: 1 | -1) {
  let nextIndex = highlightedIndex;
  for (let attempts = 0; attempts < filteredItems.length; attempts += 1) {
    nextIndex = (nextIndex + direction + filteredItems.length) % filteredItems.length;
    highlightedIndex = nextIndex;
    return; // ← early return makes this loop run exactly once, always
  }
}
```

The `return` inside the loop makes the loop body execute only once. The loop was presumably written to skip disabled items (copied from `SearchableSelect` where items can be disabled), but `PresetNumericInput` has no disabled items. The `for` loop can be removed entirely — the function body can be just:

```ts
function highlightNextOption(direction: 1 | -1) {
  if (filteredItems.length === 0) { highlightedIndex = -1; return; }
  highlightedIndex = (highlightedIndex + direction + filteredItems.length) % filteredItems.length;
}
```

---

## Duplicated "close on click outside" logic

Both `SearchableSelect.svelte` and `PresetNumericInput.svelte` contain the same `onMount` block:

```ts
onMount(() => {
  function handlePointerDown(event: MouseEvent) {
    if (rootElement && event.target instanceof Node && !rootElement.contains(event.target)) {
      closeDropdown(...);
    }
  }
  document.addEventListener("mousedown", handlePointerDown);
  return () => document.removeEventListener("mousedown", handlePointerDown);
});
```

This should be extracted to a shared utility, for example a Svelte action:
```ts
// src/utils/clickOutside.ts
export function clickOutside(node: HTMLElement, callback: () => void) {
  function handlePointerDown(event: MouseEvent) {
    if (event.target instanceof Node && !node.contains(event.target)) {
      callback();
    }
  }
  document.addEventListener("mousedown", handlePointerDown);
  return { destroy() { document.removeEventListener("mousedown", handlePointerDown); } };
}
```

Usage: `<div use:clickOutside={closeDropdown}>`.

---

## `ChartLegend.svelte` — coupling to model-specific zone data (will be fixed by main refactor)

The legend imports zone arrays for every model directly from `helpers.ts` and decides which to show with chains of `{#if}` blocks. This has the same problem as `ResultsPanel` — it must be updated every time a model is added. After the main refactor, the legend should receive the zones it needs from the model config (`getComfortModelConfig(selectedModel).zones`), not import them individually. Do not add new `{#if}` blocks for new models here.

---

## `ComfortDashboard.svelte` — unnecessary handler wrappers

Several handlers are one-line pass-throughs:
```ts
function handleSelectChart(nextChart: ChartId) {
  toolState.actions.setSelectedChart(nextChart);
}
```

This can be passed directly as a prop: `onSelectChart={toolState.actions.setSelectedChart}`. The same applies to `handleSelectXAxis` and `handleSelectYAxis` if the type cast is moved into the action itself. `handleSelectBaselineInput` uses `as any` which is a sign of a type mismatch between `string` and `InputIdType` — fix the type rather than cast it.
