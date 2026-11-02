# Spec review

Rules for the Spec axis of `/code-review`, on top of the skill's own brief.

- Judge each story clause, not the ticket's checklist. Every case a story enumerates ("missing, extra, damaged") names
  the test that covers it; a case with no test is a gap.
- A story about what a person types or sees is probed in Chromium with a throwaway Playwright script, not concluded from
  reading. Type texts whose shown form differs from the typed one: `0.0`, `1.50`, `25.`.
- For a fix, list every other writer of the state the fix guards (Reset, back navigation, model switch, Apply, a step)
  and probe each; the fix's own test only proves the bug.
- A ticket Comment settles a question only when it reads `Ruling (user, …)` (see `issue-tracker.md`); an agent note
  that leaves a story unmet is a gap.
