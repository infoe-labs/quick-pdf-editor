import type { Fragment, Selection } from "./types";
import { point } from "./geometry";
// Estimate free baseline distance using extracted text boxes and the page box.
// This flags text/page collisions; it does not claim to detect images or rules.
export function availableTextWidth(
  s: Selection,
  runs: Fragment[],
  bounds: number[],
): number {
  const size = Math.hypot(s.transform[0], s.transform[1]);
  const ux = s.transform[0] / size,
    uy = s.transform[1] / size;
  const x = s.transform[4],
    y = s.transform[5];
  let available = Infinity;
  if (ux > 1e-8) available = Math.min(available, (bounds[2] - x) / ux);
  if (ux < -1e-8) available = Math.min(available, (bounds[0] - x) / ux);
  if (uy > 1e-8) available = Math.min(available, (bounds[3] - y) / uy);
  if (uy < -1e-8) available = Math.min(available, (bounds[1] - y) / uy);
  const project = (px: number, py: number) => [
    (px - x) * ux + (py - y) * uy,
    -(px - x) * uy + (py - y) * ux,
  ];
  const top = s.ascent * size,
    bottom = -0.22 * size;
  for (const r of runs) {
    if (r.id === s.id) {
      const end = s.offset + s.original.length;
      const suffix = r.text.slice(end);
      const next = suffix.search(/\S/);
      if (next >= 0) {
        const index = end + next;
        const advance = r.advances?.[index] ?? index / r.text.length;
        const start =
          project(r.transform[4], r.transform[5])[0] + advance * r.width;
        if (start >= s.width - 0.5) available = Math.min(available, start);
      }
      continue;
    }
    if (s.sourceIds.includes(r.id)) continue;
    const rs = Math.hypot(r.transform[0], r.transform[1]);
    if (rs < 1e-8) continue;
    const corners = [
      [0, -0.22],
      [r.width / rs, -0.22],
      [r.width / rs, r.ascent],
      [0, r.ascent],
    ].map(([u, v]) => project(...point(r.transform, u, v)));
    const left = Math.min(...corners.map((p) => p[0])),
      right = Math.max(...corners.map((p) => p[0]));
    const low = Math.min(...corners.map((p) => p[1])),
      high = Math.max(...corners.map((p) => p[1]));
    if (
      high > bottom + size * 0.1 &&
      low < top - size * 0.1 &&
      right > s.width + 0.5
    )
      available = Math.min(available, Math.max(s.width, left));
  }
  return Math.max(s.width, Number.isFinite(available) ? available : s.width);
}
export function correctionExtent(e: {
  width: number;
  naturalWidth?: number;
  fitScale?: number;
}): number {
  return Math.max(e.width, (e.naturalWidth ?? e.width) * (e.fitScale ?? 1));
}
