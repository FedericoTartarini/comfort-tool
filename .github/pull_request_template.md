## Summary

<!-- What changes and why, in two or three sentences. -->

## Linked issue

<!-- e.g. Closes #NN / Relates to #20 -->

## How it was tested

<!-- Commands run, inputs compared against the deployed tool, screenshots. -->

## Checklist

- [ ] Title follows Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `ci:` …)
- [ ] `npm test`, `npm run check`, `npm run lint` and `npm run build` pass (CI shows this)
- [ ] The human pass of `docs/code-quality-checklist.md` has been read against the diff
- [ ] No `eslint-disable` added to get past an architecture boundary rule
- [ ] Adding a model touched only its declaration file and one registry line (if applicable)
- [ ] Behaviour changes are compared against the deployed tool, with the source of expected values noted
