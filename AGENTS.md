# Repository Guidelines

## Scope

Static Svelte 5 SPA at the repository root. Product code lives in `src/`. No
backend, no server assumptions. Never commit generated artifacts (`dist/`,
`node_modules/`, coverage, caches, Playwright output).

**This branch (`rewrite/v1`) is a rewrite in progress.** The previous
application was deleted and `src/` is being rebuilt. The old tree is checked
out read-only at `../comfort-tool-old/` as a behaviour reference — read it to
answer "what did the old tool do here", never to copy code from.

## Where the rules live

| Document | Contents |
| --- | --- |
| [docs/adr-0001-architecture.md](docs/adr-0001-architecture.md) | The architecture decision record. Authoritative; wins on any conflict. |
| [docs/rewrite-plan.md](docs/rewrite-plan.md) | Phased plan. Each phase is meant to be one working session. |
| [docs/code-quality-checklist.md](docs/code-quality-checklist.md) | What the machine checks, what a human reads for, and when each pass runs. |
| [CLAUDE.md](CLAUDE.md) | Working summary: layout, import direction, conventions. |

Read the ADR before making structural changes. When a change moves layer
boundaries, state flow, model registration, or chart ownership, update
`CLAUDE.md` in the same commit.

## Execution rules

- **Adding a model = one declaration file + one registry line.** If a model
  needs a third file, stop and fix the architecture.
- Architecture boundaries are enforced in `eslint.config.js`, not by review.
  A boundary violation is a lint failure. Do not add an `eslint-disable` to get
  past one — either the import is wrong or the rule is, and both need a decision.
- The library (`jsthermalcomfort`, symlinked to `../../forked repo/jsthermalcomfort`
  on branch `typescript`) owns every formula, threshold and comfort-zone
  geometry. The app never implements one, with one written exception: unit
  conversion for display (°C↔°F, m/s↔fpm) lives in `src/core/units.ts`. The
  library is a general-purpose package; nothing that exists only for this tool
  (input steps, defaults, option copy, route path segments) goes into it. The
  app consumes the fork's **build output**, so a library change requires
  `npm run build` inside the fork first.
- Canonical stored state is SI. The library is called with `units: "SI"` only.
- Do not add a dependency for something a few lines of the standard library or
  an already-installed package can do.

## Validation

```bash
npm test && npm run check && npm run lint && npm run build
```

All four must pass before a change is done. Behaviour differences against the
old tool are checked by running `../comfort-tool-old/` side by side, not by
trusting a screenshot.

## Commits

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
Do not run git write commands unless explicitly asked in that message.
