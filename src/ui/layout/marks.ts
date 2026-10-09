/** Where the CBE tools' brand files are served from, `public/brand-media/`. */
const BRAND_MEDIA = `${import.meta.env.BASE_URL}brand-media/`;

/**
 * The two marks the bands carry (ADR-0002 decision 73, rule 5), white for the
 * brand's blue, with their files' sizes, so the page keeps a mark's room
 * before the image arrives.
 */
export const marks = {
  cbe: { src: `${BRAND_MEDIA}CBE-logo-2019-white.png`, width: 1598, height: 554 },
  berkeley: { src: `${BRAND_MEDIA}ucb-logo-2024-white.png`, width: 675, height: 184 },
} as const;
