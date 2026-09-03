import type { Outcome, Quantity } from "jsthermalcomfort/io";
import type { ApplicabilityLimit, IntervalScale, StandardRef } from "jsthermalcomfort/reference";

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
