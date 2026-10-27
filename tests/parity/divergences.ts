import { expect } from "@playwright/test";
import known from "./known-divergences.json" with { type: "json" };

/**
 * The strict check `known-divergences.json` describes, as a helper every
 * model's parity test imports (tests/parity/README.md, "Known divergences").
 *
 * Two rules, and the second is the one that is easy to forget:
 *
 *  1. A difference the file does not list fails the test. The app has moved
 *     away from the deployed tool and nobody has decided whether that is
 *     wanted.
 *  2. A listed entry that no longer holds also fails the test. The app has
 *     moved back into agreement and the entry has to go. Without this, the
 *     file silently accumulates permissions for differences that stopped
 *     existing, and a real regression could hide behind one.
 *
 * Only the maintainer edits the file, so a test never writes to it. When a
 * difference turns up that is not listed, the failure is the report: it
 * carries the page, the subject, the inputs and both values, which is what
 * the findings template in issue #30 asks for.
 */

/** Which side of a subject a divergence is about. */
export type Aspect = "value" | "default" | "range" | "out-of-range";

interface Divergence {
  readonly page: string;
  readonly subjects: readonly string[];
  readonly aspect: Aspect;
  readonly cases: "all" | readonly Record<string, number>[];
  readonly decision: string;
  readonly reason: string;
}

const divergences = known.divergences as readonly Divergence[];

/**
 * The entry covering this page, subject and aspect, or `undefined`.
 *
 * `cases` is not consulted here. A per-case entry still produces an entry for
 * the subject; whether this particular case is covered is decided by
 * {@link coversCase}, so that a case outside the list is reported as an
 * unlisted difference rather than quietly allowed.
 */
function entryFor(page: string, subject: string, aspect: Aspect): Divergence | undefined {
  return divergences.find((entry) => entry.page === page && entry.aspect === aspect && entry.subjects.includes(subject));
}

/** Whether `entry` covers `inputs`, comparing the case objects field by field. */
function coversCase(entry: Divergence, inputs: Readonly<Record<string, number>>): boolean {
  if (entry.cases === "all") {
    return true;
  }
  return entry.cases.some((listed) => {
    const keys = new Set([...Object.keys(listed), ...Object.keys(inputs)]);
    return [...keys].every((key) => listed[key] === inputs[key]);
  });
}

/**
 * Match the app's display rule (ADR §4.6): round to hundredths and normalize
 * signed zero. Keep this black-box contract here rather than importing src/.
 * There is no extra epsilon: crossing a displayed step is a difference.
 */
function shown(value: number): string {
  const scaled = value * 100;
  if (!Number.isFinite(value) || !Number.isFinite(scaled)) {
    throw new Error(`Cannot compare a non-finite or unrepresentable parity value: ${value}`);
  }
  const rounded = Math.round(scaled) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

export interface ParityCheck {
  /** The page's address, as `known-divergences.json` writes it. */
  readonly page: string;
  /** The subject's name as the page shows it: a result column's header, or an input's field label. */
  readonly subject: string;
  readonly aspect: Aspect;
  /** The case's inputs, in the fixture's form. Used to match a per-case entry, and printed on failure. */
  readonly inputs: Readonly<Record<string, number>>;
  /** What the app showed, as a number in SI. */
  readonly app: number;
  /** What the deployed tool produced for the same inputs, from the fixture. */
  readonly deployed: number;
}

/**
 * A tracker for one page. Call {@link Tracker.check} once per subject per
 * case, then {@link Tracker.assertListedStillHold} once, after every case has
 * run, so that rule 2 is applied with the whole run in view.
 */
export interface Tracker {
  check(check: Omit<ParityCheck, "page">): void;
  assertListedStillHold(): void;
}

export function trackerFor(page: string): Tracker {
  // Every entry that applies to this page, and whether any case has actually
  // differed. An entry that ends the run unseen is an entry that no longer
  // holds.
  const seen = new Map<Divergence, boolean>();
  for (const entry of divergences) {
    if (entry.page === page) {
      seen.set(entry, false);
    }
  }

  return {
    check({ subject, aspect, inputs, app, deployed }) {
      const entry = entryFor(page, subject, aspect);
      const agrees = shown(app) === shown(deployed);
      const where = `${page} — ${subject} (${aspect}) at ${JSON.stringify(inputs)}`;

      if (agrees) {
        // Agreement is only a problem when an entry claims this case differs.
        // That is reported by assertListedStillHold, once the run can show
        // that no case under the entry differed, rather than here, where one
        // agreeing case proves nothing.
        return;
      }

      if (!entry || !coversCase(entry, inputs)) {
        throw new Error(
          [
            `Unlisted difference from the deployed CBE tool.`,
            where,
            `  deployed: ${shown(deployed)}`,
            `  app:      ${shown(app)}`,
            ``,
            `If this difference is intended, it belongs in tests/parity/known-divergences.json,`,
            `which only the maintainer edits. Report it on issue #30 using the findings template,`,
            `with the inputs and both values above.`,
          ].join("\n"),
        );
      }

      seen.set(entry, true);
    },

    assertListedStillHold() {
      const stale = [...seen.entries()]
        .filter(([, hit]) => !hit)
        .map(([entry]) => `  ${entry.subjects.join(", ")} (${entry.aspect}) — ${entry.decision}: ${entry.reason}`);

      expect(
        stale,
        [
          `A listed divergence no longer holds; the app now agrees with the deployed tool`,
          `for every case this run covered. The entry has to be removed from`,
          `tests/parity/known-divergences.json, which only the maintainer edits.`,
          `Report it on issue #30 so the row can be marked fixed.`,
          ``,
          ...stale,
        ].join("\n"),
      ).toEqual([]);
    },
  };
}
