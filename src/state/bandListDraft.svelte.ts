import type { ClassifierBins } from "jsthermalcomfort";
import {
  addEdge,
  bandListOf,
  edgeNeighbours,
  isEdgeInOrder,
  moveEdge,
  removeEdge,
  setColor,
  setLabel,
  type BandList,
  type EdgeNeighbours,
} from "$lib/core/bands";

/** An Edge move refused for falling out of order: the Edge typed, and the Edges it had to fall between then. */
export interface EdgeRefusal extends EdgeNeighbours {
  readonly edge: number;
}

/**
 * A copy of one model's Band list, which the Bands dialog edits (ADR-0002
 * decision 84, rule 6): the edits the chart settings' list takes, made by the
 * Band list module's operations on the copy, and Reset to the classifier's.
 * The chart never reads it; Apply writes it through the chart settings, and a
 * draft dropped unapplied changes nothing. Built by `ChartState.draftBands`.
 */
export class BandListDraft {
  /** The classifier the Band list began as, which Add and Reset read. */
  readonly #classifier: ClassifierBins;
  readonly #write: (list: BandList) => void;
  // Replaced whole, never mutated, so `$state.raw`.
  #bands: BandList;
  /** Each Edge whose last move was refused, by band. */
  #refusals: ReadonlyMap<number, EdgeRefusal>;

  /** A draft of `bands`, the list `classifier` began, which Apply hands to `write`. */
  constructor(bands: BandList, classifier: ClassifierBins, write: (list: BandList) => void) {
    this.#classifier = classifier;
    this.#write = write;
    this.#bands = $state.raw(bands);
    this.#refusals = $state.raw(new Map());
  }

  get bands(): BandList {
    return this.#bands;
  }

  /** Whether band `index`'s Edge at `edge`, in the output's SI unit, keeps the Edges in order: the Edge box's verdict. */
  isInOrder(index: number, edge: number): boolean {
    return isEdgeInOrder(this.#bands, index, edge);
  }

  /**
   * Band `index`'s Edge moved to `edge`, in the output's SI unit, unless it
   * falls at or beyond a neighbour: then the list is left as it was, and the
   * refusal is kept until that Edge is next moved.
   */
  moveEdge(index: number, edge: number): void {
    const refusals = new Map(this.#refusals);
    const moved = moveEdge(this.#bands, index, edge);
    if (moved === this.#bands) {
      refusals.set(index, { edge, ...edgeNeighbours(this.#bands, index) });
    } else {
      this.#bands = moved;
      refusals.delete(index);
    }
    this.#refusals = refusals;
  }

  /** Why band `index`'s Edge was last refused, or `undefined` where its last move was taken or none was made. */
  refusalAt(index: number): EdgeRefusal | undefined {
    return this.#refusals.get(index);
  }

  /** Band `index` split at its midpoint, the lower half unlabelled and uncoloured. */
  addBand(index: number): void {
    this.#reshape(addEdge(this.#bands, index, this.#classifier));
  }

  /** Band `index` merged into the band above, the last into the one below; the only band stays. */
  removeBand(index: number): void {
    this.#reshape(removeEdge(this.#bands, index));
  }

  setLabel(index: number, label: string): void {
    this.#bands = setLabel(this.#bands, index, label);
  }

  /** Band `index` recoloured, or painted nowhere for `undefined`. */
  setColor(index: number, color: string | undefined): void {
    this.#bands = setColor(this.#bands, index, color);
  }

  /** The classifier's bands and colours again, in the draft alone until Apply. */
  reset(): void {
    this.#reshape(bandListOf(this.#classifier));
  }

  /** The draft written as the chart's Band list. */
  apply(): void {
    this.#write(this.#bands);
  }

  /** The list replaced by one whose bands may stand in other places, so no refusal still names its Edge. */
  #reshape(list: BandList): void {
    this.#bands = list;
    this.#refusals = new Map();
  }
}
