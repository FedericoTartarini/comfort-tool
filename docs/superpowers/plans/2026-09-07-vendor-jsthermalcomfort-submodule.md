# Vendor `jsthermalcomfort` as a Git Submodule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the machine-specific `file:../../forked repo/jsthermalcomfort` dependency with an in-repo git submodule so anyone who clones comfort-tool can `npm install` and run both projects' tests.

**Architecture:** The fork `yehui-h/jsthermalcomfort` (branch `Feature/export-model-metadata`) is added as a submodule at `vendor/jsthermalcomfort`. `package.json` points `jsthermalcomfort` at `file:vendor/jsthermalcomfort`, and a `postinstall` script initialises the submodule, installs its dev dependencies, and compiles `lib/esm` + `lib/cjs` (the fork gitignores `lib/`, and `file:` links never trigger a build on their own). Root tooling (Vitest, ESLint) is told to ignore `vendor/**` so the fork's own Jest suite (`tests/**/*.test.js`, some of it network-dependent) is not swept into the root `npm test`.

**Tech Stack:** npm 11 / Node 24, git submodules, Vitest (configured in `vite.config.js`), ESLint flat config.

**Spec:** No separate spec document. Requirements come from the 2026-09-07 conversation and are restated in Global Constraints below.

## Global Constraints

- **Git operations are the user's.** The executing agent must NOT run `git submodule add`, `git commit`, `git push`, `git add`, or any command that writes to git history or the index. Leave changes in the working tree and report them.
- Task 0 is performed by the user before any agent task starts. The agent verifies its outcome, nothing more.
- The dependency key stays `jsthermalcomfort` so the 32 existing `import ... from "jsthermalcomfort"` / `"jsthermalcomfort/lib/esm/models/adaptive_en.js"` statements under `src/` do not change.
- Do not modify anything inside `vendor/jsthermalcomfort/` (that is the fork's own repository).
- Canonical `package.json` script names `dev`, `build`, `check`, `lint`, `test`, `test:visual` keep their meaning.
- Done criteria from CLAUDE.md apply: `npm test`, `npm run check`, `npm run lint`, `npm run build` all pass.
- Existing working-tree state: `package-lock.json` already shows as staged-modified (`M`). Do not try to "clean" that; it will simply be overwritten by the regenerated lock file.

---

### Task 0 (USER, git): add the submodule

**Files:**
- Create: `.gitmodules` (written by git)
- Create: `vendor/jsthermalcomfort` (gitlink written by git)

**Interfaces:**
- Produces: a populated `vendor/jsthermalcomfort/` checkout on branch `Feature/export-model-metadata` (commit `338ecd8`, already on origin) whose `package.json` has `"name": "jsthermalcomfort"` and `"version": "1.4.0"`.

- [ ] **Step 1: Add the submodule to comfort-tool**

The branch is already pushed (`origin/Feature/export-model-metadata` = `338ecd8`), so nothing needs pushing first. Note the capital `F` in the branch name.

```bash
cd "/Users/yehuihuang/SoftwareProjects/USYD/main repo/comfort-tool-old"
git submodule add -b Feature/export-model-metadata https://github.com/yehui-h/jsthermalcomfort.git vendor/jsthermalcomfort
```

Expected: `.gitmodules` appears with `path = vendor/jsthermalcomfort`, `url = https://github.com/yehui-h/jsthermalcomfort.git`, `branch = Feature/export-model-metadata`; `vendor/jsthermalcomfort/package.json` exists.

---

### Task 1: Verify Task 0 outcome (agent precondition gate)

**Files:**
- Read: `.gitmodules`, `vendor/jsthermalcomfort/package.json`

- [ ] **Step 1: Check the submodule is present and correct**

Run:
```bash
cat .gitmodules
grep -n '"name"\|"version"' vendor/jsthermalcomfort/package.json
git -C vendor/jsthermalcomfort log --oneline -1
```

Expected: `.gitmodules` names `vendor/jsthermalcomfort`, the `yehui-h/jsthermalcomfort.git` URL, and `branch = Feature/export-model-metadata`; grep prints `"name": "jsthermalcomfort"` and `"version": "1.4.0"`; the log line is `338ecd8 refactor: simplify model documentation descriptions`. Also run `git -C vendor/jsthermalcomfort branch --show-current` and expect `Feature/export-model-metadata`.

If any of these fail, STOP and report; do not try to run git submodule commands yourself.

---

### Task 2: Point `package.json` at the submodule and build it on install

**Files:**
- Modify: `package.json` (line 45 dependency; `scripts` block lines 6–16)
- Regenerate: `package-lock.json`

**Interfaces:**
- Produces: `node_modules/jsthermalcomfort` → symlink to `../vendor/jsthermalcomfort`; `vendor/jsthermalcomfort/lib/esm/index.js` exists after `npm install`.

- [ ] **Step 1: Confirm the current (failing) state**

Run: `grep -n '"jsthermalcomfort"' package.json && grep -n 'forked repo' package-lock.json`
Expected: line 45 shows `"jsthermalcomfort": "file:../../forked repo/jsthermalcomfort"` and the lock file has one `"resolved": "../../forked repo/jsthermalcomfort"` entry.

- [ ] **Step 2: Change the dependency path**

In `package.json` replace

```json
    "jsthermalcomfort": "file:../../forked repo/jsthermalcomfort",
```

with

```json
    "jsthermalcomfort": "file:vendor/jsthermalcomfort",
```

- [ ] **Step 3: Add the `postinstall` script**

In the `scripts` object of `package.json`, add this entry after `"preview": "vite preview",` (keep the existing entries untouched):

```json
    "postinstall": "git submodule update --init --recursive && npm ci --prefix vendor/jsthermalcomfort && npm run build --prefix vendor/jsthermalcomfort",
```

Why each part:
- `git submodule update --init --recursive` makes a plain `git clone` (without `--recurse-submodules`) still work.
- `npm ci --prefix vendor/jsthermalcomfort` installs the fork's devDependencies (`typescript` is needed for its build) from its own `package-lock.json`. The fork's `prepare` script runs `husky`; inside a submodule that only sets `core.hooksPath` in the submodule's own git config and is harmless.
- `npm run build --prefix vendor/jsthermalcomfort` runs the fork's `build` script (`clean` + `build:esm` + `build:cjs`, both `tsc -p ./configs/tsconfig.*.json`) to produce `lib/esm` and `lib/cjs`.

- [ ] **Step 4: Regenerate the lock file and the link**

Run: `npm install`
Expected: exits 0; the postinstall output shows the nested `npm ci` and `tsc` run.

- [ ] **Step 5: Verify the result**

Run:
```bash
grep -n 'forked repo' package-lock.json || echo "no local path left"
grep -n -A3 '"node_modules/jsthermalcomfort"' package-lock.json
ls -l node_modules/jsthermalcomfort
ls vendor/jsthermalcomfort/lib/esm/index.js vendor/jsthermalcomfort/lib/esm/models/adaptive_en.js
```

Expected: `no local path left`; lock entry shows `"resolved": "vendor/jsthermalcomfort"` and `"link": true`; the symlink target is `../vendor/jsthermalcomfort`; both `lib/esm` files exist.

- [ ] **Step 6: Do not commit** — leave `package.json` and `package-lock.json` modified for the user.

---

### Task 3: Keep the fork's tests and sources out of root tooling

**Files:**
- Modify: `vite.config.js` (`test` block, lines 10–13)
- Modify: `eslint.config.js` (global `ignores` array, lines 52–58)

**Interfaces:**
- Produces: root `npm test` only runs `src/**` tests; `npx eslint .` would skip `vendor/**`.

- [ ] **Step 1: Show that Vitest currently picks up the fork's tests**

Run: `npx vitest list 2>/dev/null | grep -c '^vendor/' `
Expected: a number greater than 0 (Vitest's default include is `**/*.{test,spec}.?(c|m)[jt]s?(x)` and the fork ships Jest tests as `tests/**/*.test.js`, several of which download expectation data over the network).

- [ ] **Step 2: Exclude `vendor/**` from Vitest**

In `vite.config.js` change

```js
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
```

to

```js
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // vendor/jsthermalcomfort is a git submodule with its own Jest suite;
    // run it with `npm test --prefix vendor/jsthermalcomfort`.
    exclude: [...configDefaults.exclude, "vendor/**"],
  },
```

and add the import at the top of the file, after the existing `import { defineConfig } from "vite";` line:

```js
import { configDefaults } from "vitest/config";
```

- [ ] **Step 3: Verify Vitest no longer sees them**

Run: `npx vitest list 2>/dev/null | grep -c '^vendor/'`
Expected: `0`.

Run: `npx vitest list 2>/dev/null | grep -c '^src/'`
Expected: the same number of `src/` tests as before the change (record the count from Step 1's run for comparison).

- [ ] **Step 4: Add `vendor/**` to the ESLint global ignores**

In `eslint.config.js` change

```js
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
```

to

```js
    ignores: [
      "dist/**",
      "node_modules/**",
      "vendor/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
```

- [ ] **Step 5: Verify lint and tests still pass**

Run: `npm run lint && npm test`
Expected: both exit 0.

- [ ] **Step 6: Do not commit** — leave for the user.

---

### Task 4: Document the submodule workflow

**Files:**
- Modify: `README.md` — "Prerequisites" (lines 44–47), "Development" (lines 49–54), "Source layout" tree (starts line 93)

**Interfaces:**
- Consumes: the `postinstall` script from Task 2 and the exclusion from Task 3 (README describes them).

- [ ] **Step 1: Update Prerequisites**

Replace

```markdown
## Prerequisites

- **Node.js** ≥ 22 (`engines` in `package.json`)
- **npm** (ships with Node)
```

with

```markdown
## Prerequisites

- **Node.js** ≥ 22 (`engines` in `package.json`)
- **npm** (ships with Node)
- **git** — the thermal-comfort engine is a git submodule (see below)
```

- [ ] **Step 2: Update Development with the submodule workflow**

Replace

```markdown
## Development

```bash
npm install
npm run dev
```
```

with

```markdown
## Development

The calculation engine is a fork of [`jsthermalcomfort`](https://github.com/yehui-h/jsthermalcomfort) (branch `Feature/export-model-metadata`) vendored as a git submodule at `vendor/jsthermalcomfort`. `package.json` links to it with `file:vendor/jsthermalcomfort`, and `postinstall` initialises the submodule, installs its dev dependencies, and compiles `lib/esm`. There is nothing to install by hand.

```bash
git clone --recurse-submodules <repo-url>
cd comfort-tool
npm install
npm run dev
```

If you cloned without `--recurse-submodules`, `npm install` initialises the submodule for you.

### Working on the engine

Edit the fork in place under `vendor/jsthermalcomfort`, then rebuild it so the app picks up the change:

```bash
npm run build --prefix vendor/jsthermalcomfort
```

The fork has its own Jest test suite, kept out of the root `npm test` by the `vendor/**` exclusion in `vite.config.js`:

```bash
npm test --prefix vendor/jsthermalcomfort
```

Commit engine changes inside the submodule and push them to the fork first; then commit the updated submodule pointer in this repository:

```bash
cd vendor/jsthermalcomfort
git add -A && git commit -m "..." && git push origin Feature/export-model-metadata
cd ../..
git add vendor/jsthermalcomfort
git commit -m "chore: bump jsthermalcomfort submodule"
```

To pull the newest fork commit that someone else pushed:

```bash
git submodule update --remote vendor/jsthermalcomfort
npm run build --prefix vendor/jsthermalcomfort
```
```

- [ ] **Step 3: Add `vendor/` to the Source layout tree**

At the end of the `text` tree block that starts at line 93 (the block ending with the line `  testSupport/ ...` before the closing triple backtick), append one top-level entry so the tree ends:

```text
vendor/
  jsthermalcomfort/  git submodule: forked calculation engine (built to lib/esm by postinstall)
```

Keep the existing `src/` subtree unchanged; just add the `vendor/` lines after it, inside the same fenced block.

- [ ] **Step 4: Sanity-check the markdown renders**

Run: `grep -n '^```' README.md | awk 'END{print NR%2==0 ? "fences balanced" : "UNBALANCED fences"}'`
Expected: `fences balanced`.

- [ ] **Step 5: Do not commit** — leave for the user.

---

### Task 5: Clean-room verification (what a fresh clone experiences)

**Files:**
- None modified.

- [ ] **Step 1: Wipe everything `npm install` is supposed to produce**

Run:
```bash
rm -rf node_modules vendor/jsthermalcomfort/node_modules vendor/jsthermalcomfort/lib
```

- [ ] **Step 2: Install from scratch**

Run: `npm install`
Expected: exits 0; `ls vendor/jsthermalcomfort/lib/esm/index.js` succeeds; `ls -l node_modules/jsthermalcomfort` shows the symlink to `../vendor/jsthermalcomfort`.

- [ ] **Step 3: Run the Done-criteria commands**

Run, one at a time, and record exit codes:
```bash
npm test
npm run check
npm run lint
npm run build
```
Expected: all four exit 0. `npm test` must not list any `vendor/` test file.

- [ ] **Step 4: Run the fork's own suite once to prove the documented command works**

Run: `npm test --prefix vendor/jsthermalcomfort`
Expected: exits 0 (this runs the fork's Jest suite; some tests fetch expectation data over the network; if the only failures are network timeouts, report that verbatim rather than treating it as a regression in this change).

- [ ] **Step 5: Report the working-tree diff for the user to commit**

Run: `git status --short && git diff --stat`
Expected changed/new paths: `.gitmodules`, `vendor/jsthermalcomfort`, `package.json`, `package-lock.json`, `vite.config.js`, `eslint.config.js`, `README.md`, `docs/superpowers/plans/2026-09-07-vendor-jsthermalcomfort-submodule.md`. Do NOT run `git add` or `git commit`; list this in the final report so the user can commit.
