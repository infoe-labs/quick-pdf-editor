import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Fragment, Matrix } from "./types";
import { textMetrics } from "./text-metrics";
import { joinAdjacent } from "./geometry";
GlobalWorkerOptions.workerSrc = workerUrl;
export async function openPdf(
  bytes: Uint8Array,
  password?: string,
): Promise<PDFDocumentProxy> {
  return getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdf-assets/wasm/`,
    useSystemFonts: false,
    enableXfa: false,
    verbosity: 0,
  }).promise;
}
export async function extract(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<Fragment[]> {
  const page = await doc.getPage(pageNumber);
  const metrics = await textMetrics(page);
  const content = await page.getTextContent();
  return joinAdjacent(
    content.items.flatMap((item, index) => {
      if (!("str" in item) || !item.str.trim()) return [];
      const style = content.styles[item.fontName];
      let fontName: string | undefined;
      try {
        const font = page.commonObjs.get(item.fontName) as { name?: string };
        fontName = font?.name;
      } catch {
        /* Diagnostics stay unresolved when internal resource access is unavailable. */
      }
      const match = metrics.findIndex(
        (m) => m.fontId === item.fontName && m.text === item.str,
      );
      const metric = match >= 0 ? metrics.splice(match, 1)[0] : undefined;
      return [
        {
          advances: metric?.advances,
          characterSpacing: metric?.characterSpacing,
          wordSpacing: metric?.wordSpacing,
          horizontalScale: metric?.horizontalScale,
          textRise: metric?.textRise,
          id: `${pageNumber}:${index}`,
          page: pageNumber,
          text: item.str,
          fontId: item.fontName,
          fontName,
          family: `"${item.fontName}", ${style?.fontFamily || "sans-serif"}`,
          transform: item.transform as Matrix,
          width: item.width,
          height: item.height,
          ascent: style?.ascent ?? 0.8,
          direction: item.dir,
        },
      ];
    }),
  );
}
