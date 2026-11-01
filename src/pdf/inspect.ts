import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFTextField,
  PDFCheckBox,
} from "pdf-lib";
import type { FontInfo } from "./types";
export interface Inspection {
  fonts: FontInfo[][];
  signed: boolean;
  forms: { name: string; type: string; value: string }[];
}
export async function inspect(bytes: Uint8Array): Promise<Inspection> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  let signed = false;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (
      obj instanceof PDFDict &&
      (obj.get(PDFName.of("ByteRange")) ||
        obj.get(PDFName.of("Type"))?.toString() === "/Sig")
    )
      signed = true;
  }
  const fonts = doc.getPages().map((page) => {
    const resources = page.node.Resources();
    const fonts = resources?.lookup(PDFName.of("Font"));
    if (!(fonts instanceof PDFDict)) return [];
    return fonts.entries().flatMap(([key, ref]) => {
      const f = doc.context.lookup(ref);
      if (!(f instanceof PDFDict)) return [];
      let descendant = f;
      const ds = f.lookup(PDFName.of("DescendantFonts"));
      if (ds instanceof PDFArray) {
        const d = ds.lookup(0);
        if (d instanceof PDFDict) descendant = d;
      }
      const descriptor = descendant.lookup(PDFName.of("FontDescriptor"));
      const embedded =
        descriptor instanceof PDFDict &&
        ["FontFile", "FontFile2", "FontFile3"].some((k) =>
          descriptor.has(PDFName.of(k)),
        );
      const name = (
        f.get(PDFName.of("BaseFont"))?.toString() || "Unknown"
      ).replace(/^\//, "");
      const enc = f.get(PDFName.of("Encoding"));
      const encoding =
        enc instanceof PDFDict
          ? "Custom differences"
          : enc?.toString() || "Implicit";
      const widths = descendant.lookup(PDFName.of("Widths"));
      const reusable =
        !embedded &&
        /^(Helvetica|Times-(Roman|Bold|Italic|BoldItalic)|Courier)(-Bold|-Oblique|-BoldOblique)?$/.test(
          name,
        ) &&
        ["Implicit", "/WinAnsiEncoding", "/StandardEncoding"].includes(
          encoding,
        );
      return [
        {
          id: key.toString().slice(1),
          name,
          subtype: f.get(PDFName.of("Subtype"))?.toString() || "Unknown",
          embedded,
          subset: /^[A-Z]{6}\+/.test(name),
          encoding,
          toUnicode: f.has(PDFName.of("ToUnicode")),
          widths: widths instanceof PDFArray ? widths.size() : 0,
          descriptor: descriptor instanceof PDFDict,
          reusable,
          reason: reusable
            ? "Standard font with supported encoding."
            : "Embedded/custom glyph reuse is not verified. A named compatible font is used for the preview.",
        },
      ];
    });
  });
  const forms = doc
    .getForm()
    .getFields()
    .map((f) => ({
      name: f.getName(),
      type:
        f instanceof PDFTextField
          ? "PDFTextField"
          : f instanceof PDFCheckBox
            ? "PDFCheckBox"
            : "Unsupported field",
      value:
        "getText" in f
          ? String((f as unknown as { getText(): string }).getText() || "")
          : f instanceof PDFCheckBox
            ? String(f.isChecked())
            : "",
    }));
  return { fonts, signed, forms };
}
