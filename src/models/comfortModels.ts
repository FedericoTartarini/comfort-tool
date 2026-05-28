export const ComfortModel = {
  Pmv: "PMV",
  Utci: "UTCI",
  AdaptiveAshrae: "ADAPTIVE_ASHRAE",
  AdaptiveEn: "ADAPTIVE_EN",
  HeatIndex: "HEAT_INDEX",
  Humidex: "HUMIDEX",
  WindChill: "WIND_CHILL",
} as const;

export type ComfortModel = (typeof ComfortModel)[keyof typeof ComfortModel];

// todo AI comfortModelOrder and comfortModelMetaById need to be kept in sync with the comfortModelConfigs object in src/state/comfortTool/modelConfigs/index.ts. If you add a model here but forget to register it in modelConfigs (or vice versa), the app will silently break at runtime. Ideally, the model configs would be the single registration point and this order/meta would be derived from them.
// The order in which the comfort models are displayed in the dropdown.
export const comfortModelOrder: ComfortModel[] = [
  ComfortModel.Pmv,
  ComfortModel.Utci,
  ComfortModel.AdaptiveAshrae,
  ComfortModel.AdaptiveEn,
  ComfortModel.HeatIndex,
  ComfortModel.Humidex,
  ComfortModel.WindChill,
];

export const comfortModelMetaById: Record<
  ComfortModel,
  {
    label: string;
    description: string;
  }
> = {
  [ComfortModel.Pmv]: {
    label: "PMV (ASHRAE-55)",
    description: "ASHRAE 55 PMV/PPD with comfort zone overlays.",
  },
  [ComfortModel.Utci]: {
    label: "UTCI",
    description: "Outdoor UTCI with stress category visualization.",
  },
  [ComfortModel.AdaptiveAshrae]: {
    label: "Adaptive (ASHRAE-55)",
    description: "ASHRAE 55 Adaptive thermal comfort model for naturally ventilated buildings.",
  },
  [ComfortModel.AdaptiveEn]: {
    label: "Adaptive (EN 16798-1)",
    description: "EN 16798-1 Adaptive thermal comfort model for naturally ventilated buildings.",
  },
  [ComfortModel.HeatIndex]: {
    label: "Heat Index",
    description: "Combines air temperature and relative humidity to determine the human-perceived equivalent temperature.",
  },
  [ComfortModel.Humidex]: {
    label: "Humidex",
    description: "Canadian index used to describe how hot the weather feels to the average person, by combining the effects of heat and humidity.",
  },
  [ComfortModel.WindChill]: {
    label: "Wind Chill",
    description: "Index that measures how cold it feels when wind is factored in with the actual air temperature.",
  },
};
