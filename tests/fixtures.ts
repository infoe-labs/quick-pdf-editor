import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFString,
  PDFHexString,
  PDFDict,
} from "pdf-lib";
export async function fixture(kind = "financial"): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  d.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  let font = await d.embedFont(StandardFonts.Helvetica);
  if (kind === "truetype" || kind === "subset") {
    d.registerFontkit(fontkit);
    font = await d.embedFont(
      await readFile(
        "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
      ),
      {
        subset: kind === "subset",
        customName:
          kind === "subset" ? "ABCDEF+LiberationSans" : "LiberationSans",
      },
    );
  }
  const serif = await d.embedFont(StandardFonts.TimesRoman);
  const mono = await d.embedFont(StandardFonts.Courier);
  const p = d.addPage([612, 792]);
  p.drawText("SYNTHETIC DOCUMENT — TEST DATA", {
    x: 48,
    y: 740,
    size: 11,
    font,
    color: rgb(0.2, 0.4, 0.35),
  });
  p.drawText("Pay Date: 2026/10/10", { x: 48, y: 680, size: 14, font });
  p.drawText("Unchanged surrounding content", {
    x: 48,
    y: 630,
    size: 12,
    font: serif,
  });
  p.drawText("001234  9,876.54", { x: 48, y: 600, size: 12, font: mono });
  for (let i = 0; i < 5; i++)
    p.drawRectangle({
      x: 48,
      y: 400 + i * 30,
      width: 510,
      height: 30,
      borderWidth: 0.5,
      borderColor: rgb(0.6, 0.7, 0.65),
    });
  p.drawText("Rotated text", {
    x: 560,
    y: 500,
    size: 12,
    font,
    rotate: degrees(90),
  });
  const p2 = d.addPage([612, 792]);
  p2.drawText("Second page — preserved vectors", {
    x: 48,
    y: 720,
    size: 16,
    font: serif,
  });
  p2.drawText("2026/", { x: 48, y: 660, size: 14, font });
  p2.drawText("10/", {
    x: 48 + font.widthOfTextAtSize("2026/", 14),
    y: 660,
    size: 14,
    font,
  });
  p2.drawText("10", {
    x: 48 + font.widthOfTextAtSize("2026/10/", 14),
    y: 660,
    size: 14,
    font,
  });
  if (kind === "form") {
    const field = d.getForm().createTextField("Synthetic name");
    field.setText("Example");
    field.addToPage(p, { x: 48, y: 300, width: 200, height: 25 });
  }
  if (kind === "signed") {
    const sig = d.context.obj({
      Type: "Sig",
      Filter: "Adobe.PPKLite",
      SubFilter: "adbe.pkcs7.detached",
      ByteRange: [0, 1, 2, 3],
      Contents: PDFHexString.of("00"),
      Reason: PDFString.of("Synthetic invalid signature fixture"),
    });
    d.catalog.set(PDFName.of("SyntheticSignature"), d.context.register(sig));
  }
  if (kind === "scanned") {
    const png = await d.embedPng(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE9sAAAAASUVORK5CYII=",
    );
    const scan = d.addPage([612, 792]);
    scan.drawImage(png, { x: 0, y: 0, width: 612, height: 792 });
  }
  if (kind === "cff") {
    await d.flush();
    const dict = d.context.lookup(serif.ref) as PDFDict;
    const stream = d.context.register(
      d.context.flateStream(
        await readFile("node_modules/pdfjs-dist/standard_fonts/FoxitSerif.pfb"),
        { Subtype: "Type1C" },
      ),
    );
    const descriptor = d.context.register(
      d.context.obj({
        Type: "FontDescriptor",
        FontName: "ChromSerifOTF",
        Flags: 32,
        FontBBox: [-168, -218, 1000, 898],
        ItalicAngle: 0,
        Ascent: 891,
        Descent: -216,
        CapHeight: 662,
        StemV: 80,
        FontFile3: stream,
      }),
    );
    dict.set(PDFName.of("FontDescriptor"), descriptor);
  }
  return d.save({ useObjectStreams: false });
}
