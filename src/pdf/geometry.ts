import type { Fragment, Selection, Matrix } from "./types";
export function point(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function inversePoint(
  m: Matrix,
  x: number,
  y: number,
): [number, number] {
  const d = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(d) < 1e-10) throw Error("Unsupported singular transform");
  return [
    (m[3] * (x - m[4]) - m[2] * (y - m[5])) / d,
    (-m[1] * (x - m[4]) + m[0] * (y - m[5])) / d,
  ];
}
// Use relative measured advances; PDF extraction has no public per-character geometry.
export function advances(text: string, family: string): number[] {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `100px ${family}`;
  const a = [0];
  for (let i = 1; i <= text.length; i++)
    a.push(ctx.measureText(text.slice(0, i)).width);
  const total = a.at(-1) || 1;
  return a.map((x) => x / total);
}
export function selectWord(
  run: Fragment,
  fraction: number,
  mode: "word" | "run" = "word",
): Selection {
  let start = 0,
    end = run.text.length;
  if (mode === "word") {
    const a = run.advances || advances(run.text, run.family);
    const found = a.findIndex((x) => x > fraction);
    const index = found < 0 ? run.text.length - 1 : Math.max(0, found - 1);
    const matches = [...run.text.matchAll(/\S+/g)];
    const hit = matches.find(
      (m) => index >= m.index! && index < m.index! + m[0].length,
    );
    if (hit) {
      start = hit.index!;
      end = start + hit[0].length;
    }
  }
  const a = run.advances || advances(run.text, run.family);
  const size = Math.hypot(run.transform[0], run.transform[1]);
  const offset = a[start] * run.width;
  const t = [...run.transform] as Matrix;
  t[4] += (run.transform[0] / size) * offset;
  t[5] += (run.transform[1] / size) * offset;
  return {
    ...run,
    transform: t,
    width: (a[end] - a[start]) * run.width,
    text: run.text.slice(start, end),
    original: run.text.slice(start, end),
    offset: start,
    sourceIds: [run.id],
  };
}
export function joinAdjacent(runs: Fragment[]): Fragment[] {
  const out: Fragment[] = [];
  for (const r of runs) {
    const prev = out.at(-1);
    const s = prev ? Math.hypot(prev.transform[0], prev.transform[1]) : 0;
    const angle = prev ? Math.atan2(prev.transform[1], prev.transform[0]) : 0;
    const end = prev
      ? [
          prev.transform[4] + Math.cos(angle) * prev.width,
          prev.transform[5] + Math.sin(angle) * prev.width,
        ]
      : [0, 0];
    if (
      prev &&
      prev.fontId === r.fontId &&
      Math.abs(angle - Math.atan2(r.transform[1], r.transform[0])) < 0.001 &&
      Math.abs(s - Math.hypot(r.transform[0], r.transform[1])) < 0.05 &&
      Math.hypot(end[0] - r.transform[4], end[1] - r.transform[5]) < s * 0.18
    ) {
      if (prev.advances && r.advances) {
        const total = prev.width + r.width;
        prev.advances = [
          ...prev.advances.map((v) => (v * prev.width) / total),
          ...r.advances.slice(1).map((v) => (prev.width + v * r.width) / total),
        ];
      } else prev.advances = undefined;
      prev.text += r.text;
      prev.width += r.width;
    } else out.push({ ...r });
  }
  return out;
}

export function extendSelection(a: Selection, b: Selection): Selection | null {
  if (a.id === b.id && a.offset === b.offset) return a;
  if (a.pageId !== b.pageId || a.fontId !== b.fontId) return null;
  const size = Math.hypot(a.transform[0], a.transform[1]);
  const ux = a.transform[0] / size,
    uy = a.transform[1] / size;
  const dx = b.transform[4] - a.transform[4],
    dy = b.transform[5] - a.transform[5];
  if (
    Math.abs(dx * -uy + dy * ux) > size * 0.15 ||
    Math.abs(size - Math.hypot(b.transform[0], b.transform[1])) > 0.05
  )
    return null;
  const distance = dx * ux + dy * uy;
  const first = distance < 0 ? b : a;
  const second = distance < 0 ? a : b;
  if (Math.abs(distance) > a.width + b.width + size * 2) return null;
  const gap = Math.abs(distance) - first.width;
  const text =
    first.original + (gap > size * 0.15 ? " " : "") + second.original;
  return {
    ...first,
    id: first.id,
    original: text,
    text,
    width: Math.max(first.width, Math.abs(distance) + second.width),
    sourceIds: [...new Set([...a.sourceIds, ...b.sourceIds])],
    advances: undefined,
  };
}
