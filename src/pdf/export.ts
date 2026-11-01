import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFTextField,
  PDFCheckBox,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from "pdf-lib";
import { removeLegacyChangeLog } from "./attachments";
import type { ExportRequest, Edit } from "./types";
export function fallbackName(name: string): StandardFonts {
  const n = name.toLowerCase();
  const bold = n.includes("bold");
  const italic = /italic|oblique/.test(n);
  if (/courier|mono/.test(n))
    return bold
      ? italic
        ? StandardFonts.CourierBoldOblique
        : StandardFonts.CourierBold
      : italic
        ? StandardFonts.CourierOblique
        : StandardFonts.Courier;
  if (/times|serif/.test(n) && !n.includes("sans"))
    return bold
      ? italic
        ? StandardFonts.TimesRomanBoldItalic
        : StandardFonts.TimesRomanBold
      : italic
        ? StandardFonts.TimesRomanItalic
        : StandardFonts.TimesRoman;
  return bold
    ? italic
      ? StandardFonts.HelveticaBoldOblique
      : StandardFonts.HelveticaBold
    : italic
      ? StandardFonts.HelveticaOblique
      : StandardFonts.Helvetica;
}
export function editGeometry(e: Edit) {
  const [a, b, c, d, x, y] = e.transform;
  const size = Math.hypot(a, b);
  const rotation = (Math.atan2(b, a) * 180) / Math.PI;
  const dot = (a * c + b * d) / (size * Math.hypot(c, d));
  if (
    size < 0.1 ||
    Math.abs(dot) > 0.01 ||
    a * d - b * c <= 0 ||
    Math.abs(size - Math.hypot(c, d)) > size * 0.02
  )
    throw Error(
      "Skewed, reflected, or nonuniform text cannot be corrected safely.",
    );
  return { size, rotation, x, y };
}
export async function exportPdf(req: ExportRequest): Promise<Uint8Array> {
  const doc = await PDFDocument.load(req.source.slice(), {
    updateMetadata: false,
  });
  removeLegacyChangeLog(doc);
  const original = doc.getPages();
  for (const [name, value] of Object.entries(req.formValues || {})) {
    const field = doc.getForm().getField(name);
    if (field instanceof PDFTextField) field.setText(value);
    else if (field instanceof PDFCheckBox) {
      if (value === "true") field.check();
      else field.uncheck();
    } else throw Error("Unsupported form field");
  }
  // Reordering references preserves the existing document tree/resources better than copyPages.
  const copies = new Map<string, (typeof original)[number]>();
  const seen = new Set<number>();
  for (const entry of req.pages) {
    if (seen.has(entry.source)) {
      const [copy] = await doc.copyPages(doc, [entry.source]);
      copies.set(entry.id, copy);
    }
    seen.add(entry.source);
  }
  for (let i = doc.getPageCount() - 1; i >= 0; i--) doc.removePage(i);
  for (const entry of req.pages) {
    const page = copies.get(entry.id) || original[entry.source];
    if (!page) throw Error("Invalid page");
    doc.addPage(page);
    page.setRotation(degrees(entry.rotation));
    for (const e of req.edits.filter((e) => e.pageId === entry.id)) {
      const { size, rotation, x, y } =
        e.type === "correction"
          ? {
              size: Math.hypot(e.transform[0], e.transform[1]),
              rotation:
                (Math.atan2(e.transform[1], e.transform[0]) * 180) / Math.PI,
              x: e.transform[4],
              y: e.transform[5],
            }
          : editGeometry(e);
      const font = await doc.embedFont(fallbackName(e.fontName));
      if (e.type === "correction") {
        font.encodeText(e.replacement);
        const [a, b, c, d] = e.transform;
        const fit = e.fitScale ?? 1;
        if (
          ![a, b, c, d, x, y, fit].every(Number.isFinite) ||
          Math.abs(a * d - b * c) < 1e-8 ||
          fit <= 0 ||
          fit > 1
        )
          throw Error("Invalid correction geometry");
        const bg = e.background || [1, 1, 1],
          fg = e.foreground || [0, 0, 0];
        // Keep the original affine matrix and baseline. Fit only the horizontal
        // glyph advances, so a longer value never spills onto adjacent content.
        page.pushOperators(
          pushGraphicsState(),
          concatTransformationMatrix(a, b, c, d, x, y),
        );
        page.drawRectangle({
          x: 0,
          y: -0.22,
          width: e.width / size,
          height: (e.ascent ?? 0.9) + 0.26,
          color: rgb(...bg),
        });
        page.pushOperators(concatTransformationMatrix(fit, 0, 0, 1, 0, 0));
        page.drawText(e.replacement, {
          x: 0,
          y: 0,
          size: 1,
          font,
          color: rgb(...fg),
        });
        page.pushOperators(popGraphicsState());
      }
      if (e.type === "annotation")
        page.drawText(e.replacement, {
          x,
          y,
          size,
          font,
          color: rgb(0.08, 0.28, 0.35),
          rotate: degrees(rotation),
        });
      if (e.type === "shape")
        page.drawRectangle({
          x,
          y,
          width: e.width,
          height: e.height,
          borderColor: rgb(0.08, 0.28, 0.35),
          borderWidth: 1.2,
        });
      if (e.type === "highlight")
        page.drawRectangle({
          x,
          y: y - size * 0.2,
          width: e.width,
          height: e.height,
          color: rgb(1, 0.84, 0.1),
          opacity: 0.32,
          rotate: degrees(rotation),
        });
      if (e.type === "draw" && e.points)
        for (let i = 1; i < e.points.length; i++)
          page.drawLine({
            start: { x: e.points[i - 1][0], y: e.points[i - 1][1] },
            end: { x: e.points[i][0], y: e.points[i][1] },
            thickness: 1.5,
            color: rgb(0.05, 0.2, 0.3),
          });
      if (e.type === "image" && e.image) {
        const image = e.image.startsWith("data:image/png")
          ? await doc.embedPng(e.image)
          : await doc.embedJpg(e.image);
        page.drawImage(image, { x, y, width: e.width, height: e.height });
      }
    }
    if (req.label) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: 16,
        color: rgb(0.96, 0.97, 0.98),
      });
      page.drawText("CORRECTED COPY • Modified document", {
        x: 12,
        y: 5,
        size: 7,
        font: await doc.embedFont(StandardFonts.Helvetica),
        color: rgb(0.22, 0.3, 0.35),
      });
    }
  }
  if (req.label) {
    doc.setTitle("Corrected copy");
    doc.setSubject(
      "Modified document. Edit history remains local to PrecisionPDF.",
    );
  }
  return doc.save();
}
