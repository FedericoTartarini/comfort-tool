/**
 * Zone colour tokens (Plan 2c).
 *
 * Models select a token. Screen, publication, and colour-blind hex live in
 * this table so print and colour-blind updates happen in one place.
 * Sweeping leftover chart hex (series strokes, Compare markers, plot
 * backgrounds) is not required.
 */

export const ZoneToken = {
  Cold: "cold",
  Cool: "cool",
  SlightlyCool: "slightly-cool",
  Neutral: "neutral",
  SlightlyWarm: "slightly-warm",
  Warm: "warm",
  Hot: "hot",
  TooCool: "too-cool",
  Acceptable: "acceptable",
  Preferred: "preferred",
  TooWarm: "too-warm",
  WideAcceptable: "wide-acceptable",
  ExtremeCold: "extreme-cold",
  VeryStrongCold: "very-strong-cold",
  StrongCold: "strong-cold",
  ModerateCold: "moderate-cold",
  SlightCold: "slight-cold",
  NoStress: "no-stress",
  ModerateHeat: "moderate-heat",
  StrongHeat: "strong-heat",
  VeryStrongHeat: "very-strong-heat",
  ExtremeHeat: "extreme-heat",
  Safe: "safe",
  Caution: "caution",
  StrongCaution: "strong-caution",
  Intense: "intense",
  Danger: "danger",
  ExtremeDanger: "extreme-danger",
  FrostbiteSafe: "frostbite-safe",
  Frostbite30Min: "frostbite-30-min",
  Frostbite10Min: "frostbite-10-min",
  Frostbite2Min: "frostbite-2-min",
  PassFill: "pass-fill",
  FailFill: "fail-fill",
  ElevatedFail: "elevated-fail",
} as const;

export type ZoneToken = (typeof ZoneToken)[keyof typeof ZoneToken];

export const ZonePaletteKind = {
  Screen: "screen",
  Publication: "publication",
  ColourBlind: "colourBlind",
} as const;

export type ZonePaletteKind =
  (typeof ZonePaletteKind)[keyof typeof ZonePaletteKind];

export interface ZoneAppearance {
  readonly fill: string;
  readonly text: string;
}

interface ZoneThemeRow {
  readonly [ZonePaletteKind.Screen]: ZoneAppearance;
  readonly [ZonePaletteKind.Publication]: ZoneAppearance;
  readonly [ZonePaletteKind.ColourBlind]: ZoneAppearance;
}

function appearance(fill: string, text: string): ZoneAppearance {
  return { fill, text };
}

function row(
  screen: ZoneAppearance,
  publication: ZoneAppearance,
  colourBlind: ZoneAppearance,
): ZoneThemeRow {
  return {
    [ZonePaletteKind.Screen]: screen,
    [ZonePaletteKind.Publication]: publication,
    [ZonePaletteKind.ColourBlind]: colourBlind,
  };
}

/**
 * One mapping table. Edit publication or colour-blind columns here; do not
 * scatter hex through model declarations.
 *
 * Screen fills preserve the current product colours. Tokens that share a
 * screen fill must share publication and colour-blind fills so figure remapping
 * stays unambiguous.
 */
export const ZONE_THEME = {
  [ZoneToken.Cold]: row(
    appearance("#0571b0", "#1d4ed8"),
    appearance("#045990", "#1e3a8a"),
    appearance("#004d80", "#000000"),
  ),
  [ZoneToken.Cool]: row(
    appearance("#4c78a8", "#2563eb"),
    appearance("#3d628c", "#1d4ed8"),
    appearance("#0072b2", "#004d80"),
  ),
  [ZoneToken.SlightlyCool]: row(
    appearance("#92c5de", "#0369a1"),
    appearance("#6ea8c4", "#0e4d73"),
    appearance("#56b4e9", "#0072b2"),
  ),
  [ZoneToken.Neutral]: row(
    appearance("#f2f2f2", "#475569"),
    appearance("#d4d4d4", "#334155"),
    appearance("#dddddd", "#000000"),
  ),
  [ZoneToken.SlightlyWarm]: row(
    appearance("#f4a582", "#ea580c"),
    appearance("#e08a5e", "#c2410c"),
    appearance("#e69f00", "#994c00"),
  ),
  [ZoneToken.Warm]: row(
    appearance("#e15759", "#b91c1c"),
    appearance("#c94446", "#991b1b"),
    appearance("#d55e00", "#7a3400"),
  ),
  [ZoneToken.Hot]: row(
    appearance("#cc79a7", "#701a75"),
    appearance("#b35d8e", "#581c87"),
    appearance("#cc79a7", "#6b2160"),
  ),
  [ZoneToken.TooCool]: row(
    appearance("#3b82f6", "#2563eb"),
    appearance("#2563eb", "#1d4ed8"),
    appearance("#56b4e9", "#0072b2"),
  ),
  [ZoneToken.Acceptable]: row(
    appearance("#86efac", "#047857"),
    appearance("#4ade80", "#065f46"),
    appearance("#009e73", "#004d3a"),
  ),
  [ZoneToken.Preferred]: row(
    appearance("#22c55e", "#047857"),
    appearance("#16a34a", "#065f46"),
    appearance("#007a59", "#004d3a"),
  ),
  [ZoneToken.TooWarm]: row(
    appearance("#ef4444", "#b91c1c"),
    appearance("#dc2626", "#991b1b"),
    appearance("#d55e00", "#7a3400"),
  ),
  [ZoneToken.WideAcceptable]: row(
    appearance("#fde047", "#047857"),
    appearance("#eab308", "#065f46"),
    appearance("#f0e442", "#6b5e00"),
  ),
  [ZoneToken.ExtremeCold]: row(
    appearance("#0f172a", "#64748b"),
    appearance("#020617", "#334155"),
    appearance("#000000", "#333333"),
  ),
  [ZoneToken.VeryStrongCold]: row(
    appearance("#1d4ed8", "#2563eb"),
    appearance("#1e3a8a", "#1d4ed8"),
    appearance("#004d80", "#000000"),
  ),
  [ZoneToken.StrongCold]: row(
    appearance("#2563eb", "#3b82f6"),
    appearance("#1d4ed8", "#2563eb"),
    appearance("#0072b2", "#004d80"),
  ),
  [ZoneToken.ModerateCold]: row(
    appearance("#3b82f6", "#60a5fa"),
    appearance("#2563eb", "#1d4ed8"),
    appearance("#56b4e9", "#0072b2"),
  ),
  [ZoneToken.SlightCold]: row(
    appearance("#7dd3fc", "#0284c7"),
    appearance("#38bdf8", "#0369a1"),
    appearance("#9ccee8", "#0072b2"),
  ),
  [ZoneToken.NoStress]: row(
    appearance("#34d399", "#059669"),
    appearance("#10b981", "#047857"),
    appearance("#009e73", "#004d3a"),
  ),
  [ZoneToken.ModerateHeat]: row(
    appearance("#fbbf24", "#d97706"),
    appearance("#f59e0b", "#b45309"),
    appearance("#f0e442", "#6b5e00"),
  ),
  [ZoneToken.StrongHeat]: row(
    appearance("#fb923c", "#ea580c"),
    appearance("#f97316", "#c2410c"),
    appearance("#e69f00", "#994c00"),
  ),
  [ZoneToken.VeryStrongHeat]: row(
    appearance("#f97316", "#c2410c"),
    appearance("#ea580c", "#9a3412"),
    appearance("#d55e00", "#7a3400"),
  ),
  [ZoneToken.ExtremeHeat]: row(
    appearance("#dc2626", "#b91c1c"),
    appearance("#b91c1c", "#7f1d1d"),
    appearance("#cc79a7", "#6b2160"),
  ),
  [ZoneToken.Safe]: row(
    appearance("#e2e8f0", "#475569"),
    appearance("#cbd5e1", "#334155"),
    appearance("#dddddd", "#000000"),
  ),
  [ZoneToken.Caution]: row(
    appearance("#fef08a", "#854d0e"),
    appearance("#facc15", "#713f12"),
    appearance("#f0e442", "#6b5e00"),
  ),
  [ZoneToken.StrongCaution]: row(
    appearance("#fde047", "#a16207"),
    appearance("#eab308", "#854d0e"),
    appearance("#f0e442", "#6b5e00"),
  ),
  [ZoneToken.Intense]: row(
    appearance("#facc15", "#a16207"),
    appearance("#eab308", "#854d0e"),
    appearance("#e69f00", "#994c00"),
  ),
  [ZoneToken.Danger]: row(
    appearance("#f97316", "#ea580c"),
    appearance("#ea580c", "#9a3412"),
    appearance("#d55e00", "#7a3400"),
  ),
  [ZoneToken.ExtremeDanger]: row(
    appearance("#dc2626", "#b91c1c"),
    appearance("#b91c1c", "#7f1d1d"),
    appearance("#cc79a7", "#6b2160"),
  ),
  [ZoneToken.FrostbiteSafe]: row(
    appearance("#e0f2fe", "#0369a1"),
    appearance("#bae6fd", "#075985"),
    appearance("#9ccee8", "#0072b2"),
  ),
  [ZoneToken.Frostbite30Min]: row(
    appearance("#64b5f5", "#1d4ed8"),
    appearance("#3b82f6", "#1e3a8a"),
    appearance("#56b4e9", "#0072b2"),
  ),
  [ZoneToken.Frostbite10Min]: row(
    appearance("#5c6bc0", "#3730a3"),
    appearance("#4338ca", "#312e81"),
    appearance("#0072b2", "#004d80"),
  ),
  [ZoneToken.Frostbite2Min]: row(
    appearance("#8e24aa", "#6b21a8"),
    appearance("#7b1fa2", "#581c87"),
    appearance("#cc79a7", "#6b2160"),
  ),
  [ZoneToken.PassFill]: row(
    appearance("#bbf7d0", "#047857"),
    appearance("#86efac", "#065f46"),
    appearance("#009e73", "#004d3a"),
  ),
  [ZoneToken.FailFill]: row(
    appearance("#fecaca", "#b91c1c"),
    appearance("#fca5a5", "#991b1b"),
    appearance("#d55e00", "#7a3400"),
  ),
  [ZoneToken.ElevatedFail]: row(
    appearance("#fca5a5", "#b91c1c"),
    appearance("#f87171", "#991b1b"),
    appearance("#d55e00", "#7a3400"),
  ),
} as const satisfies Record<ZoneToken, ZoneThemeRow>;

const ZONE_TOKEN_VALUES = new Set<string>(Object.values(ZoneToken));

export function isZoneToken(value: string): value is ZoneToken {
  return ZONE_TOKEN_VALUES.has(value);
}

export function resolveZoneAppearance(
  token: ZoneToken,
  palette: ZonePaletteKind = ZonePaletteKind.Screen,
): ZoneAppearance {
  return ZONE_THEME[token][palette];
}

function normalizeHex(color: string): string {
  return color.trim().toLowerCase();
}

interface ScreenFillRemap {
  readonly publication: string;
  readonly colourBlind: string;
}

function screenFillLookup(): ReadonlyMap<string, ScreenFillRemap> {
  const fills = new Map<string, ScreenFillRemap>();
  for (const token of Object.values(ZoneToken)) {
    const theme = ZONE_THEME[token];
    const screenFill = normalizeHex(theme[ZonePaletteKind.Screen].fill);
    const remap: ScreenFillRemap = {
      publication: normalizeHex(theme[ZonePaletteKind.Publication].fill),
      colourBlind: normalizeHex(theme[ZonePaletteKind.ColourBlind].fill),
    };
    const existing = fills.get(screenFill);
    if (existing) {
      if (
        existing.publication !== remap.publication
        || existing.colourBlind !== remap.colourBlind
      ) {
        throw new Error(
          `Zone token "${token}" reuses screen fill ${screenFill} with a different print or colour-blind fill.`,
        );
      }
      continue;
    }
    fills.set(screenFill, remap);
  }
  return fills;
}

const SCREEN_FILL_REMAP = screenFillLookup();

/**
 * Map a screen-palette zone fill onto another palette. Unknown hex (Compare
 * markers, series strokes, Explore custom colours) passes through.
 */
export function remapZoneFill(
  color: string,
  palette: ZonePaletteKind,
): string {
  if (palette === ZonePaletteKind.Screen) {
    return color;
  }
  const mapped = SCREEN_FILL_REMAP.get(normalizeHex(color));
  if (mapped === undefined) {
    return color;
  }
  return palette === ZonePaletteKind.Publication
    ? mapped.publication
    : mapped.colourBlind;
}
