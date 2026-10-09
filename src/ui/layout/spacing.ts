/**
 * The spacing scale layout components accept, read from the page's two spacing tokens (ADR-0002 decision 73,
 * rule 2): `"1"` within a field, `"2"` and `"4"` between and within rows. Full class names so Tailwind can see them.
 */
export const gapClass = {
  "1": "gap-(--space-field)",
  "2": "gap-(--space-page)",
  "4": "gap-(--space-page)",
} as const;

export type Gap = keyof typeof gapClass;
