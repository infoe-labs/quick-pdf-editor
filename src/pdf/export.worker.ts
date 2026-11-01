import { exportPdf } from "./export";
import type { ExportRequest } from "./types";
console.warn = console.info = console.error = console.log = () => {};
self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    const bytes = await exportPdf(event.data);
    self.postMessage({ bytes });
  } catch {
    self.postMessage({
      error:
        "Export failed. Unsupported text encoding, transform, encryption, or PDF structure. Original retained.",
    });
  }
};
