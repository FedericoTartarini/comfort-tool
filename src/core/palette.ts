/**
 * The design's named colours (ADR-0002 decision 66). The charts read them as
 * values, through the chart ink (`core/bandPalette.ts`) and the slot badges
 * (`core/slotBadge.ts`); the interface reads the same hex values as the
 * stylesheet's tokens (`app.css`), and a test holds the two files to one
 * another. Hue is spent on data alone: the slots' hues here, the bands' in
 * the band palette; the interface itself is the brand blue and slate.
 */
export const palette = {
  /**
   * UC Berkeley's blue, the one blue (decision 73, rule 3): the current navigation item, the primary button, the
   * focus ring, links.
   */
  brand: "#003262",
  /** Text. */
  ink: "#0f172a",
  /** Captions, bound text, legend text, a Band's Edge line. */
  inkMuted: "#64748b",
  /** Input borders, table row lines, the sidebar's separator. */
  line: "#e2e8f0",
  /** The isolines. */
  lineStrong: "#cbd5e1",
  /** The saturation line. */
  lineHeavy: "#94a3b8",
  /** The page's ground and a field's tint. */
  ground: "#f8fafc",
  /** A panel's and the plot's ground. */
  paper: "#ffffff",
  /** An entry out of range, a refused Edge. */
  alert: "#dc2626",
  /**
   * One hue per slot, by position: Okabe–Ito's blue, bluish green and reddish
   * purple, which colour-blind readers tell apart, and none of them a colour
   * of RdBu's or YlOrRd's.
   */
  slots: ["#0072b2", "#009e73", "#cc79a7"],
} as const;

/**
 * The design's one family and its caption's size in px (the Phase 5c spec's
 * Type), which the charts letter in; the stylesheet writes them as
 * `--font-sans` and `--font-size-caption`, and the same test holds the two.
 */
export const lettering = {
  family: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
  captionSize: 12,
} as const;
