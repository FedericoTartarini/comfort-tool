/** A closed polygon as two coordinate lists; the last vertex joins the first. */
export interface Polygon {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/**
 * Whether (`x`, `y`) lies inside `polygon`, by the even-odd rule: a ray cast
 * from the point crosses the outline an odd number of times. A point exactly
 * on the outline may fall either way.
 */
export function containsPoint(polygon: Polygon, x: number, y: number): boolean {
  let inside = false;
  const count = polygon.x.length;
  for (let index = 0, previous = count - 1; index < count; previous = index++) {
    const [x1, y1] = [polygon.x[index], polygon.y[index]];
    const [x2, y2] = [polygon.x[previous], polygon.y[previous]];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}
