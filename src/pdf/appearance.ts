import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Selection, RGB } from "./types";
import { point, inversePoint } from "./geometry";
export interface Appearance {
  background: RGB;
  foreground: RGB;
  confidence: number;
}
const bucket = (r: number, g: number, b: number) =>
  `${Math.round(r / 8) * 8},${Math.round(g / 8) * 8},${Math.round(b / 8) * 8}`;
function dominant(values: Map<string, number>): RGB {
  const key = [...values].sort((a, b) => b[1] - a[1])[0]?.[0] || "255,255,255";
  return key.split(",").map((n) => Math.min(255, Number(n)) / 255) as RGB;
}
// Sample a local border, then estimate stroke color from contrasting interior
// pixels. Uniform regions are reliable; textured backgrounds are disclosed.
export function samplePixels(
  data: ImageData,
  inside: (x: number, y: number) => [number, number],
  width: number,
  ascent: number,
): Appearance {
  const border = new Map<string, number>();
  const interior: { r: number; g: number; b: number }[] = [];
  let borderCount = 0;
  for (let y = 0; y < data.height; y++)
    for (let x = 0; x < data.width; x++) {
      const [u, v] = inside(x, y);
      if (u < -0.08 || u > width + 0.08 || v < -0.3 || v > ascent + 0.13)
        continue;
      const i = (y * data.width + x) * 4;
      const r = data.data[i],
        g = data.data[i + 1],
        b = data.data[i + 2];
      if (u < 0 || u > width || v < -0.22 || v > ascent + 0.04) {
        const k = bucket(r, g, b);
        border.set(k, (border.get(k) || 0) + 1);
        borderCount++;
      } else interior.push({ r, g, b });
    }
  const background = dominant(border);
  const ink = new Map<string, number>();
  for (const { r, g, b } of interior) {
    if (
      Math.max(
        Math.abs(r - background[0] * 255),
        Math.abs(g - background[1] * 255),
        Math.abs(b - background[2] * 255),
      ) > 70
    ) {
      const k = bucket(r, g, b);
      ink.set(k, (ink.get(k) || 0) + 1);
    }
  }
  let agreement = 0;
  for (const [k, count] of border) {
    const c = k.split(",").map(Number);
    if (c.every((n, i) => Math.abs(n - background[i] * 255) < 20))
      agreement += count;
  }
  return {
    background,
    foreground: ink.size ? dominant(ink) : [0, 0, 0],
    confidence: borderCount ? agreement / borderCount : 0,
  };
}
export async function sampleAppearance(
  doc: PDFDocumentProxy,
  s: Selection,
  signal: AbortSignal,
): Promise<Appearance> {
  const p = await doc.getPage(s.page);
  const size = Math.hypot(s.transform[0], s.transform[1]);
  const width = s.width / size;
  const base = p.getViewport({ scale: 1, rotation: 0 });
  const scale = Math.min(2, Math.sqrt(12000000 / (base.width * base.height)));
  const v = p.getViewport({ scale, rotation: 0 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(v.width);
  canvas.height = Math.ceil(v.height);
  const task = p.render({ canvas, viewport: v, annotationMode: 1 });
  const cancel = () => task.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    await task.promise;
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const corners = [
      [-0.1, -0.32],
      [width + 0.1, -0.32],
      [width + 0.1, s.ascent + 0.15],
      [-0.1, s.ascent + 0.15],
    ].map(([u, w]) => v.convertToViewportPoint(...point(s.transform, u, w)));
    const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0]))));
    const top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))));
    const right = Math.min(
      canvas.width,
      Math.ceil(Math.max(...corners.map((p) => p[0]))),
    );
    const bottom = Math.min(
      canvas.height,
      Math.ceil(Math.max(...corners.map((p) => p[1]))),
    );
    if (right <= left || bottom <= top) throw Error("Outside page");
    const pixels = canvas
      .getContext("2d")!
      .getImageData(left, top, right - left, bottom - top);
    return samplePixels(
      pixels,
      (x, y) =>
        inversePoint(
          s.transform,
          ...(v.convertToPdfPoint(x + left, y + top) as [number, number]),
        ),
      width,
      s.ascent,
    );
  } finally {
    signal.removeEventListener("abort", cancel);
    canvas.width = canvas.height = 1;
  }
}
