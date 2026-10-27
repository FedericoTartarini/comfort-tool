import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Reading the app the way a person does, shared by every model's parity test.
 *
 * The parity rules forbid importing anything from `src/`, and forbid
 * selecting by CSS class or `data-*` attribute, because both change with the
 * design. Everything here goes through roles and accessible names, which are
 * what a screen reader and a person see and are the last thing to change
 * silently.
 *
 * The result table is a column per output and a row per slot, so a result is
 * found by locating its column header and then reading that position in the
 * slot's row.
 */

/** The field for one quantity, named by its label followed by its unit symbol. */
export function field(page: Page, label: string): Locator {
  return page.getByRole("spinbutton", { name: new RegExp(`^${label}`) });
}

/**
 * Type a value into each named field and commit it.
 *
 * The app reads a row when its field changes, and a field still focused may
 * not have committed by the time the next one is filled, so each is blurred
 * in turn — which is also what a person does by tabbing on.
 */
export async function enterValues(page: Page, values: readonly (readonly [string, number])[]): Promise<void> {
  for (const [label, value] of values) {
    const input = field(page, label);
    await input.fill(String(value));
    await input.blur();
  }
}

/**
 * The result table's single data row. Parity tests run with Compare off, so
 * there is exactly one data row under the header.
 */
export function resultRow(page: Page): Locator {
  return page.getByRole("table").getByRole("row").nth(1);
}

/** The index of the column headed `name`, so its cell can be read positionally. */
export async function columnIndex(page: Page, name: string): Promise<number> {
  const headers = await page.getByRole("table").getByRole("columnheader").allInnerTexts();
  const index = headers.findIndex((header) => header.trim() === name);
  expect(index, `the result table has no column headed "${name}"; it has: ${headers.join(" | ")}`).toBeGreaterThan(-1);
  return index;
}

/**
 * The number in one result cell.
 *
 * A cell carries its unit symbol after the number where the quantity has one,
 * so the symbol is stripped rather than parsed. A cell holding no number at
 * all — the app's dash, shown before a first run or when an entered value is
 * out of range and the model was not run — fails here, loudly, rather than
 * reading as zero and being compared.
 */
export async function resultValue(page: Page, name: string): Promise<number> {
  const cell = resultRow(page).getByRole("cell").nth(await columnIndex(page, name));
  const text = (await cell.innerText()).trim().replace(/−/g, "-");
  const match = /^-?\d+(\.\d+)?/.exec(text);
  expect(match, `the "${name}" cell reads "${text}", which holds no number`).not.toBeNull();
  return Number(match![0]);
}

/**
 * Open a page and wait for it to have drawn.
 *
 * The chart is the last thing to settle, so it is the readiness signal rather
 * than the result table, which is in the document before its first run.
 */
export async function openPage(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await expect(page.locator(".chart-plot svg").first()).toBeVisible();
}
