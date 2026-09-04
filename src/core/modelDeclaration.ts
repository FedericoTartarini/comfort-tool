import type { PsychrometricZoneOptions } from "jsthermalcomfort/charts";
import type { Outcome, Quantity } from "jsthermalcomfort/io";
import type { ApplicabilityLimit, IntervalScale, StandardRef } from "jsthermalcomfort/reference";
import { chartType } from "./chartType";

/**
 * The metadata a library model function carries (`pmv_ppd_iso.label`,
 * `.standard`, `.limits`, …). Structural, so the model function itself
 * satisfies it; the declaration file reads from here and never writes copy or
 * transcribes numbers (ADR §4.1.3).
 */
export interface LibraryModel {
  readonly label: string;
  readonly description: string;
  /** Membership in a standard; absent for Explore-only models such as UTCI. */
  readonly standard?: StandardRef;
  /** Classification scale of the primary output, when the model has one. */
  readonly tsv?: IntervalScale;
  /** Applicability limits, the single source for range checks. */
  readonly limits?: readonly ApplicabilityLimit[];
}

/**
 * What `toLibraryInputs` produces and `run` consumes: SI values keyed by
 * `Quantity.key`, plus the two call options the app always sets.
 */
export interface LibraryInit {
  readonly units: "SI";
  readonly limit_inputs: boolean;
  readonly [quantityKey: string]: number | string | boolean;
}

/**
 * A chart a model offers (ADR §4.4). A discriminated union rather than one wide
 * object: the psychrometric chart's axes are fixed by the temperature entry
 * mode, and only the dynamic chart has a scanned output.
 */
export type ChartDeclaration =
  | {
      readonly type: typeof chartType.psychrometric;
      /**
       * Which PMV variant the comfort zone is solved with — the library's
       * calculation-variant selector, not standard membership. `"ISO"` is
       * Fanger unmodified, `"ASHRAE"` adds the elevated-air-speed cooling
       * effect.
       */
      readonly pmvVariant: PsychrometricZoneOptions["standard"];
    }
  | {
      readonly type: typeof chartType.dynamic;
      /** Starting axes; the user may pick any entered quantity that has a range. */
      readonly axes: { readonly x: Quantity; readonly y: Quantity };
      /** The output whose bands colour the surface. */
      readonly output: Quantity;
    };

/** The psychrometric member of {@link ChartDeclaration}. */
export type PsychrometricDeclaration = Extract<ChartDeclaration, { type: typeof chartType.psychrometric }>;
/** The dynamic member of {@link ChartDeclaration}. */
export type DynamicDeclaration = Extract<ChartDeclaration, { type: typeof chartType.dynamic }>;

export interface RegisteredModel {
  /** The library's io wrapper. Called only by state/compute (Phase 3: only in the worker). */
  readonly run: (init: LibraryInit) => Outcome;
  readonly model: LibraryModel;
  /** Route segment, e.g. `"pmv-iso"`. App-owned. */
  readonly pathSegment: string;
  /** Panel order and SI default values. */
  readonly inputs: readonly (readonly [Quantity, number])[];
  /** `true`: the library takes `vr`, derived as `v_relative(v, met)` from the entered `v`. */
  readonly relativeAirSpeed: boolean;
  /** Result table columns, in order. Required (ADR §4.3). */
  readonly table: readonly Quantity[];
  /** Charts, in offering order; the first is the default. Every model has at least one. */
  readonly charts: readonly [ChartDeclaration, ...ChartDeclaration[]];
}

// The union is discriminated by an object identity, which TypeScript does not
// narrow on `===` the way it narrows a literal, so each lookup carries its own
// predicate. Comparing `type.id` strings instead would be the string-keyed
// closed set ADR §4.0 rules out.

export function psychrometricChartOf(model: RegisteredModel): PsychrometricDeclaration | undefined {
  return model.charts.find((chart): chart is PsychrometricDeclaration => chart.type === chartType.psychrometric);
}

export function dynamicChartOf(model: RegisteredModel): DynamicDeclaration | undefined {
  return model.charts.find((chart): chart is DynamicDeclaration => chart.type === chartType.dynamic);
}

export function defineModel<Init extends object>(
  declaration: Omit<RegisteredModel, "run"> & { readonly run: (init: Init) => Outcome },
): RegisteredModel {
  // The declaration promises that `inputs`, after the entry-group derivations
  // in core/libraryInputs.ts, cover every key `run` requires. TypeScript
  // cannot check that across the Map → init conversion, so this is the one
  // cast of its kind in the app; libraryInputs.test.ts exercises it.
  return { ...declaration, run: declaration.run as unknown as RegisteredModel["run"] };
}

export function limitFor(model: RegisteredModel, quantity: Quantity): ApplicabilityLimit | undefined {
  return model.model.limits?.find((limit) => limit.quantity === quantity);
}
