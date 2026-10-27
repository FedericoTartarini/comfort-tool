/**
 * Generates tests/parity/fixtures/pmv-ppd-iso.json: what the deployed CBE
 * Thermal Comfort Tool computes for PMV and PPD under ISO 7730, over the grid
 * below.
 *
 * A parity test never fetches the deployed tool at run time, so its numbers
 * are produced once, here, and checked in. This script is checked in beside
 * the fixture so that anyone can regenerate it and get the same file.
 *
 * Usage:
 *
 *   git clone https://github.com/CenterForTheBuiltEnvironment/comfort_tool.git
 *   git -C comfort_tool checkout e809c965dd6eb2e785bf4851de2149c7a1d3c299
 *   node tests/parity/fixtures/generate-pmv-ppd-iso.cjs ../comfort_tool
 *
 * The deployed model is `comf.pmvEN` in `static/js/comfort-models.js`. It takes
 * the air speed and the clothing insulation **as entered**: it applies the
 * self-generated air-speed correction itself, and it does not correct the
 * clothing at all. The ISO reference path feeds the entered clothing insulation
 * to this model. So the grid holds entered values, and
 * the app's parity test enters those same values into the app's own fields.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const COMMIT = "e809c965dd6eb2e785bf4851de2149c7a1d3c299";
const MODEL_FILE = "static/js/comfort-models.js";

// Defaults first, then a spread across the page's range: cool and warm, humid
// and dry, light and heavy clothing, raised activity, and raised air speed.
const CASES = [
  {
    "tdb": 25,
    "tr": 25,
    "v": 0.1,
    "rh": 50,
    "met": 1.1,
    "clo": 0.5
  },
  {
    "tdb": 22,
    "tr": 22,
    "v": 0.1,
    "rh": 60,
    "met": 1.2,
    "clo": 0.5
  },
  {
    "tdb": 27,
    "tr": 27,
    "v": 0.1,
    "rh": 60,
    "met": 1.2,
    "clo": 0.5
  },
  {
    "tdb": 19,
    "tr": 19,
    "v": 0.1,
    "rh": 40,
    "met": 1.2,
    "clo": 1
  },
  {
    "tdb": 30,
    "tr": 30,
    "v": 0.2,
    "rh": 50,
    "met": 1,
    "clo": 0.5
  },
  {
    "tdb": 24,
    "tr": 30,
    "v": 0.1,
    "rh": 50,
    "met": 1.1,
    "clo": 0.6
  },
  {
    "tdb": 26,
    "tr": 20,
    "v": 0.15,
    "rh": 45,
    "met": 1.1,
    "clo": 0.6
  },
  {
    "tdb": 23,
    "tr": 23,
    "v": 0,
    "rh": 50,
    "met": 1,
    "clo": 1
  },
  {
    "tdb": 28,
    "tr": 28,
    "v": 0.8,
    "rh": 50,
    "met": 1.2,
    "clo": 0.5
  },
  {
    "tdb": 24,
    "tr": 24,
    "v": 0.1,
    "rh": 20,
    "met": 1.1,
    "clo": 0.5
  },
  {
    "tdb": 24,
    "tr": 24,
    "v": 0.1,
    "rh": 85,
    "met": 1.1,
    "clo": 0.5
  },
  {
    "tdb": 20,
    "tr": 20,
    "v": 0.1,
    "rh": 50,
    "met": 2,
    "clo": 0.6
  },
  {
    "tdb": 16,
    "tr": 16,
    "v": 0.1,
    "rh": 50,
    "met": 1.4,
    "clo": 1.5
  },
  {
    "tdb": 29,
    "tr": 29,
    "v": 0.3,
    "rh": 65,
    "met": 1,
    "clo": 0.3
  }
];

function main() {
  const repo = process.argv[2];
  if (!repo) {
    console.error("usage: node generate-pmv-ppd-iso.cjs <path to a comfort_tool clone>");
    process.exit(2);
  }

  // Read committed bytes, not working-tree files: local edits cannot change
  // a fixture that claims to come from this reference commit.
  const os = require("node:os");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cbe-iso-reference-"));
  try {
    for (const file of ["comfort-models.js", "psychrometrics.js", "util.js"]) {
      const source = execFileSync("git", ["-C", repo, "show", `${COMMIT}:static/js/${file}`]);
      fs.writeFileSync(path.join(temporary, file), source);
    }
    const { comf } = require(path.join(temporary, "comfort-models.js"));
    comf.useSelfGeneratedAirSpeed = true;

    const fixture = {
      source: `CenterForTheBuiltEnvironment/comfort_tool ${MODEL_FILE} comf.pmvEN`,
      commit: COMMIT,
      generatedBy: "tests/parity/fixtures/a1-pmv-ppd-iso/generate-pmv-ppd-iso.cjs",
      note: "Inputs are as entered. comf.pmvEN applies the self-generated air-speed correction itself and does not correct the clothing insulation.",
      cases: CASES.map((inputs) => {
        const r = comf.pmvEN(inputs.tdb, inputs.tr, inputs.v, inputs.rh, inputs.met, inputs.clo, 0);
        return { inputs, pmv: r.pmv, ppd: r.ppd };
      }),
    };

    const out = path.join(__dirname, "pmv-ppd-iso.json");
    fs.writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
    console.log(`wrote ${fixture.cases.length} cases to ${out}`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main();
