export interface DiffReport {
  pixels: number;
  changed: number;
  antialias: number;
  outside: number;
  maxDelta: number;
}
export function pixelDiff(
  a: ImageData,
  b: ImageData,
  inside: (x: number, y: number) => boolean,
): DiffReport {
  if (a.width !== b.width || a.height !== b.height)
    throw Error("Page dimensions differ");
  const r = {
    pixels: a.width * a.height,
    changed: 0,
    antialias: 0,
    outside: 0,
    maxDelta: 0,
  };
  for (let p = 0; p < r.pixels; p++) {
    const i = p * 4;
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    r.maxDelta = Math.max(r.maxDelta, d);
    if (d > 32) {
      r.changed++;
      if (!inside(p % a.width, Math.floor(p / a.width))) r.outside++;
    } else if (d > 0) r.antialias++;
  }
  return r;
}
