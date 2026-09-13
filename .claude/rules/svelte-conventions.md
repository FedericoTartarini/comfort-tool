---
paths:
  - "src/**/*.svelte"
  - "src/**/*.ts"
---

# Coding conventions

- **Runes only.** No `export let`, `$:`, `on:`, `<slot>`, `<svelte:component>`. Cross-component shared state is a class with `$state` fields; **`$effect` is for external synchronisation only and never assigns to state** — anything computed from state is `$derived`, per Svelte's own [Best practices](https://svelte.dev/docs/svelte/best-practices). `untrack` is banned: reaching for it means an effect is fighting a loop it created. Lint enforces both, and `state/compute.svelte.ts` carries the one recorded exemption until Phase 3.7 redesigns it.
- **Identity survives state.** Objects compared by identity (models, quantities, closed-set members, `Measure`s) are held in `$state.raw`, never a deep `$state` proxy, and are replaced rather than mutated. A proxy breaks `===` against the library's objects (`session.unitSystem === unitSystem.si` silently false).
- **Erasable syntax only.** No `enum`, no `namespace`, no constructor parameter properties (`erasableSyntaxOnly` is on). Closed sets are `as const` objects of plain data objects with a derived union type, the same shape as the library's `io.quantities` (`workspace.explore`, `temperatureMode.operative`). Behaviour is a plain function (`isWorkspaceAvailable(workspace, model)`), never a class hierarchy; id lookups are a `xxxFromId()` function used only by shareLink and navigation. State containers (`Session`, `InputSlot`) stay runes classes.
- **Naming.** Components `PascalCase.svelte`, modules `camelCase.ts`, functions start with a verb. Module constants split two ways: a scalar literal is `CONSTANT_CASE` (`GRID`, `ZONE_RH_STEP`), a closed-set table or palette is `camelCase` (`chartType`, `sensationPalette`) so it reads like the library's `io.quantities`. Lint enforces the first half. Never `engine` / `manager` / `helper` / `utils` as a filename. No abbreviations except library quantity keys. Quantity display names always come from `Quantity.label`; the app never writes one. The old tool's "Air temperature" was wrong and is not carried over; the library says "Dry-bulb air temperature". `temperatureMode` decides which quantity is shown and which is the temperature axis (`tdb` or `operative_tmp`), so axis labels switch with it for free.
- **Granularity.** One concept per file, 100–400 lines is normal. Plain functions over class hierarchies. Do not abstract for a second caller that does not exist.
- Declare component props as a named `interface Props` above the `$props()` destructuring. Complex `{#if}` conditions go in a `$derived`.
- Use shadcn-svelte primitives first; Tailwind for layout inside `ui/layout/`.
- Run generated `.svelte` through `svelte-autofixer` (Svelte MCP is configured).
