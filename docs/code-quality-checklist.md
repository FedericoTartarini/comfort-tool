# Code quality checklist

Companion to [adr-0001-architecture.md](adr-0001-architecture.md) §6 and acceptance criterion §7.10.
Agreed 2026-09-04.

## When it runs

| Pass | When | Scope |
|---|---|---|
| **Full** | End of Phase 3.7, **before** the Phase 4 acceptance | Whole `src/` tree. The last point at which a contract may still change shape |
| **Narrow** | After the Phase 4 acceptance | Only the two new files. Nothing in `core/` may change — needing to change it means the acceptance did not really pass |

Thereafter: the narrow pass at the end of every phase, the full pass whenever a contract does move (Phase 5 will move one).

## The rule that decides where a check lives

**Anything a machine can check is a lint rule or a test, not a line on this list.** Phase 0 proved the approach — import
direction, wire strings and the Tailwind boundary are all `eslint.config.js` rules today, each verified with a deliberately
violating probe file.

Two things follow. Every new rule ships with a probe that proves it errors before it is trusted — flat config **replaces**
a same-named rule when a later block matches the same file, which silently disabled two rules in Phase 0. And every time a
checklist line below turns out to be mechanisable, it should move up into the machine list and off this page.

## Machine-checked (no human pass needed)

| Check | Where | Source |
|---|---|---|
| `core/` imports no `svelte` / `state` / `ui` / `routes` | eslint `coreBoundary` | ADR §5 |
| `ui/charts/` imports no model, state or `jsthermalcomfort` | eslint `chartBoundary` | ADR §4.4 |
| Library model functions imported only in `models/` and `workers/` | eslint `libraryModelImports` | ADR §3 |
| No quantity wire string outside `shareLink.ts` | eslint `wireStringSyntax` | ADR §4.0, DRY |
| Tailwind utilities only in `ui/primitives/` and `ui/layout/` | eslint `tailwindSyntax` | ADR §2 |
| No `export let` / `$:` / `on:` / `<slot>` / `<svelte:component>` | eslint `legacySvelteSyntax` | Svelte Best practices |
| No `any` | eslint `no-explicit-any` | TS Do's and Don'ts |
| No `enum` / `namespace` / parameter properties | `erasableSyntaxOnly` | ADR §6 |
| **No assignment to state inside `$effect`; no `untrack`** | eslint `effectPurity` | Svelte Best practices |
| **Scalar module constants are `CONSTANT_CASE`** | eslint `constantCase` | ADR §6, Google TS Style Guide |
| Types check, tests pass, build succeeds | `npm run check` / `test` / `build` | — |

## Human pass

Read the diff once against each of these. They are judgement calls; none of them is mechanisable today.

**Names**

- Would a reader new to the project understand this name without opening its definition?
- No abbreviation formed by deleting letters. Library quantity keys (`tdb`, `vr`) are the standing exception — they are the
  library's vocabulary, not ours. *(Google TS Style Guide: "Do not use abbreviations that are ambiguous or unfamiliar to
  readers outside your project, and do not abbreviate by deleting letters within a word.")*
- Functions start with a verb. No `engine` / `manager` / `helper` / `utils` as a file name.
- Quantity display names come from `Quantity.label` — never written in the app.

**Single source of truth**

- Does any value now appear in two places? *(DRY, Hunt & Thomas: "every piece of knowledge must have a single,
  unambiguous, authoritative representation within a system.")* The failure mode this project cares about is the one the
  user named: changing one value should not mean hunting down its mirrors. Hold a reference, not a copy.
- Is a new threshold or limit transcribed from a standard rather than read from the library? That is always wrong (ADR §3).
- Does a new string literal duplicate an identity that already exists as an object?

**Types**

- Is a type annotation adding meaning, or restating what inference already knows? *(Google TS Style Guide: rely on
  inference; annotate where it aids readability.)*
- Do mapped and conditional types still read plainly? `Omit<RegisteredModel, "run">` in `defineModel` and the two
  `Extract<ChartDeclaration, …>` aliases are the current ones. *("A little bit of repetition or verbosity is often much
  cheaper than the long term cost of complex type expressions.")*
- Callbacks whose return value is ignored are typed `void`, not `any`.

**Svelte**

- Is every `$effect` synchronising something external? Anything computed from state belongs in `$derived`.
- Are objects compared by identity held in `$state.raw`? A deep proxy breaks `===` against the library's objects.
- Are all `{#each}` blocks keyed, with a key that uniquely identifies the item — never the index?

**Structure**

- Does `src/` still match the tree in ADR §5, and does each file hold one concept?
- Is a file outside the 100–400 line band, and if so does it earn it?
- Was anything abstracted for a second caller that does not exist? The one sanctioned exception is recorded in the plan:
  the `zones` source added in Phase 3.5 for Phase 4's Adaptive.

## Not used as criteria

*Clean Code* and *Clean Architecture* are deliberately excluded. Parts of both are actively disputed rather than settled
practice, and their layering argument is already discharged by ADR §5's import direction, which lint enforces — restating
it in a second vocabulary would only add something to argue about.

## Verified sources

- [Svelte — Best practices](https://svelte.dev/docs/svelte/best-practices)
- [TypeScript Handbook — Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- DRY — [The Pragmatic Programmer, ch. 2](https://media.pragprog.com/titles/tpp20/dry.pdf) · [overview](https://en.wikipedia.org/wiki/Don't_repeat_yourself)
