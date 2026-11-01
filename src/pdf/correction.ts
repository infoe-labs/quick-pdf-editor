import { PDFDocument, type PDFFont } from "pdf-lib";
import { fallbackName } from "./export";
import type { Edit } from "./types";
const fonts = new Map<string, Promise<PDFFont>>();
async function metricFont(name: string): Promise<PDFFont> {
  const standard = fallbackName(name);
  if (!fonts.has(standard))
    fonts.set(
      standard,
      PDFDocument.create().then((d) => d.embedFont(standard)),
    );
  return fonts.get(standard)!;
}
export function fitToRegion(
  naturalWidth: number,
  availableWidth: number,
): number {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(availableWidth) ||
    naturalWidth < 0 ||
    availableWidth <= 0
  )
    throw Error("This text has no usable editing region.");
  return naturalWidth > availableWidth ? availableWidth / naturalWidth : 1;
}
export function validateTextMatrix(e: Edit) {
  const [a, b, c, d, x, y] = e.transform;
  const size = Math.hypot(a, b);
  if (
    ![a, b, c, d, x, y].every(Number.isFinite) ||
    size < 0.01 ||
    Math.abs(a * d - b * c) < 1e-8
  )
    throw Error("This text has no usable coordinate transform.");
  return size;
}
export async function prepareCorrection(e: Edit): Promise<Edit> {
  const size = validateTextMatrix(e);
  const font = await metricFont(e.fontName);
  const supported = new Set(font.getCharacterSet());
  const missing = [
    ...new Set(
      Array.from(e.replacement).filter(
        (c) => !supported.has(c.codePointAt(0)!),
      ),
    ),
  ];
  if (missing.length)
    throw Error(
      `The local ${fallbackName(e.fontName)} font cannot draw: ${missing.join(" ")}. These glyphs need a supported font.`,
    );
  // Standard-font Tj output has no inter-glyph kerning operators: sum actual advances.
  const naturalWidth = Array.from(e.replacement).reduce(
    (sum, c) => sum + font.widthOfTextAtSize(c, size),
    0,
  );
  return {
    ...e,
    naturalWidth,
    fitScale: e.widthMode === "fit" ? fitToRegion(naturalWidth, e.width) : 1,
  };
}
