# comfort-tool

Frontend-only Svelte 5 SPA for thermal-comfort calculation, a rewrite of the CBE tool. Branch `dev` is the rewrite in progress; branch `archive/svelte-prototype` holds the previous prototype, a behaviour reference only, do not copy code from it. On 2026-11-12 `rewrite/v1` was renamed `dev` and `refactor-draft` archived as `archive/svelte-prototype`; older docs that name the old branches mean the new ones.

- Decisions: [docs/adr/](docs/adr/) wins on conflicts; ADR-0002 overrides the ADR-0001 clauses it names. Plan and current position: [docs/rewrite-plan.md](docs/rewrite-plan.md). Review checklist: [docs/code-quality-checklist.md](docs/code-quality-checklist.md).
- `jsthermalcomfort` is installed from npm at the exact version `package.json` names, a `2.0.0-next.N` prerelease (ADR-0002 decision 92); `../jsthermalcomfort` is the local checkout of its repository. The app consumes its build output `lib/esm/`. A library change the app needs goes to the jsthermalcomfort session as a handoff file, and reaches this app once it is published as the next prerelease and the version is moved with `npm install jsthermalcomfort@<version> --save-exact`. A local link to the checkout is for trying an unpublished change and is never committed.
- Single test file: `npx vitest run <file>`. `npm run test:browser` runs the Playwright tests in `tests/browser/` and starts the dev server itself; a machine runs `npx playwright install chromium` once first. `npm run check` is svelte-check over the tsconfig. `npm run lint` enforces the architecture boundaries; never add an `eslint-disable` to get past a boundary rule, either the import is wrong or the rule is.
- The one rule: adding a model = one declaration file + one registry line, zero other files change; a quantity no registered model has named before lands in `core/quantities.ts` ahead, as its own commit with a pinning test. If a change would make the next model touch a third file, fix the architecture instead of working around it.
- Do not add a dependency for what a few lines of the standard library or an installed package can do.
- Run generated `.svelte` through the Svelte MCP's `svelte-autofixer`.
- Done when `npm test`, `npm run check`, `npm run lint` and `npm run build` pass and the human half of the code-quality checklist has been read against the diff; `npm run test:browser` passes too when the diff touches `index.html`, `tests/browser/` or `playwright.config.ts`, and at the end of every Phase. Conventional Commits.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Code review

Spec sub-agents of `/code-review` also get `docs/agents/spec-review.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
