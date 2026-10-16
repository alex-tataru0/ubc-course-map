// Small sums for moving the view of the map: is a course box fully in sight, and where
// should the view go to put a point in the middle of an area.

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// Whether `box` is all inside `area` and not under any of `covered` (the bars over the map).
export function fullyVisible(box: Rect, area: Rect, covered: Rect[] = []): boolean {
  const inside = box.left >= area.left && box.top >= area.top && box.right <= area.right && box.bottom <= area.bottom;
  return inside && covered.every((c) => !overlaps(box, c));
}

// The view that puts `point` (in map coordinates) in the middle of `area` (in screen pixels,
// measured from the top-left corner of the map) at the given zoom.
export function centeredViewport(point: Point, area: Rect, zoom: number): Viewport {
  return {
    x: (area.left + area.right) / 2 - point.x * zoom,
    y: (area.top + area.bottom) / 2 - point.y * zoom,
    zoom,
  };
}
