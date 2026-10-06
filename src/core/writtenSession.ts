/**
 * The session as a plain value (ADR-0002 decision 63, rules 1 and 10): what
 * the session is built from and what it reads itself out as. A model's
 * defaults are one of these, so a session comes to hold its state one way.
 * It holds objects by identity, like the rest of the app, and no string: the
 * strings are `core/shareLink.ts`'s.
 */
import { bandListOf, type BandList } from "./bands";
import type { ChartType } from "./chartType";
import { dynamicChartOf, type ChartAxes, type RegisteredModel } from "./modelDeclaration";
import { DEFAULT_ATMOSPHERIC_PRESSURE } from "./quantities";
import { startingSlot, type Slot } from "./slot";
import { unitSystem, type UnitSystem } from "./unitSystem";

/** One model's chart settings: which chart is on screen and how it is set up. */
export interface ChartSettings {
  readonly type: ChartType;
  /** The dynamic chart's picked axes; `null` for a model that declares no dynamic chart. */
  readonly axes: ChartAxes | null;
  /** The model's Band list (ADR-0002 decision 59); `null` for a model that scans nothing. */
  readonly bands: BandList | null;
}

/**
 * Everything a session holds that is not derived and not a question left
 * standing: never the page, which the address names, nor a result.
 *
 * Every slot it holds is in slot 1's entry modes, humidity's included, as
 * every slot of a session is (ADR-0002 decision 51); a session built from one
 * that breaks this breaks the invariant `Session.entryModes` rests on.
 */
export interface WrittenSession {
  /** The model the slots were converted for. */
  readonly model: RegisteredModel;
  readonly unitSystem: UnitSystem;
  /** In Pa (ADR-0002 decision 49). */
  readonly atmosphericPressure: number;
  readonly compare: boolean;
  /** Whether slots 2 and 3 are enabled; slot 1 always is. A slot enabled holds a slot. */
  readonly enabled: readonly [boolean, boolean];
  /** What each slot holds, in slot order: slots 2 and 3 `null` until first enabled (ADR-0002 decision 50). */
  readonly slots: readonly [Slot, Slot | null, Slot | null];
  /** The chart settings of every model the session has been on, and of no other. */
  readonly charts: ReadonlyMap<RegisteredModel, ChartSettings>;
}

/** The chart settings `model` starts on, which its declaration gives: its first chart, its declared axes, its scan's classifier. */
export function startingChartSettings(model: RegisteredModel): ChartSettings {
  return {
    type: model.charts[0].type,
    axes: dynamicChartOf(model)?.axes ?? null,
    bands: model.scan ? bandListOf(model.scan.classifier) : null,
  };
}

/**
 * The written session `model` starts on, its defaults: slot 1 on
 * {@link startingSlot} and no other slot, SI, standard pressure, Compare off,
 * and the model's own {@link startingChartSettings}.
 */
export function startingSession(model: RegisteredModel): WrittenSession {
  return {
    model,
    unitSystem: unitSystem.si,
    atmosphericPressure: DEFAULT_ATMOSPHERIC_PRESSURE,
    compare: false,
    enabled: [false, false],
    slots: [startingSlot(model), null, null],
    charts: new Map([[model, startingChartSettings(model)]]),
  };
}
