import { PDFDocument } from "pdf-lib";
console.warn = console.info = console.error = console.log = () => {};
self.onmessage = async (
  event: MessageEvent<{ source: Uint8Array; additional: Uint8Array }>,
) => {
  try {
    const a = await PDFDocument.load(event.data.source, {
      updateMetadata: false,
    });
    const b = await PDFDocument.load(event.data.additional, {
      updateMetadata: false,
    });
    const pages = await a.copyPages(b, b.getPageIndices());
    pages.forEach((p) => a.addPage(p));
    self.postMessage({ bytes: await a.save() });
  } catch {
    self.postMessage({
      error:
        "Merge failed. Encrypted or unsupported documents cannot be merged.",
    });
  }
};
