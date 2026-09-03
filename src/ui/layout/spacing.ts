/** The spacing scale layout components accept. Full class names so Tailwind can see them. */
export const gapClass = {
  "1": "gap-1",
  "2": "gap-2",
  "4": "gap-4",
  "6": "gap-6",
} as const;

export type Gap = keyof typeof gapClass;
