# comfort-tool

Frontend-only Svelte 5 SPA for thermal-comfort calculation, a rewrite of the CBE tool. Branch `rewrite/v1` is the rewrite in progress; `../comfort-tool-old/` (worktree on `refactor-draft`) is a behaviour reference only, do not copy code from it.

- Decisions: [docs/adr/](docs/adr/) wins on conflicts; ADR-0002 overrides the ADR-0001 clauses it names. Plan and current position: [docs/rewrite-plan.md](docs/rewrite-plan.md). Review checklist: [docs/code-quality-checklist.md](docs/code-quality-checklist.md).
- `jsthermalcomfort` resolves to `../jsthermalcomfort` (the main repository, on the branch carrying the humidity-inverses PR until it merges). The app consumes its build output `lib/esm/`, so a library change needs `npm run build` there before this app sees it.
- Single test file: `npx vitest run <file>`. `npm run check` is svelte-check + tsc. `npm run lint` enforces the architecture boundaries; never add an `eslint-disable` to get past a boundary rule, either the import is wrong or the rule is.
- The one rule: adding a model = one declaration file + one registry line, zero other files change. If a change would make the next model touch a third file, fix the architecture instead of working around it.
- Do not add a dependency for what a few lines of the standard library or an installed package can do.
- Done when `npm test`, `npm run check`, `npm run lint` and `npm run build` pass and the human half of the code-quality checklist has been read against the diff. Conventional Commits.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/` (never GitHub Issues or PRs). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
