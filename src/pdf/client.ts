import type { ExportRequest } from "./types";
export function buildPdf(
  req: ExportRequest,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./export.worker.ts", import.meta.url), {
      type: "module",
    });
    const abort = () => {
      w.terminate();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    w.onmessage = (e) => {
      w.terminate();
      signal?.removeEventListener("abort", abort);
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data.bytes);
    };
    w.onerror = () => {
      w.terminate();
      reject(Error("PDF worker failed. Original retained."));
    };
    w.postMessage(req);
  });
}
export function download(
  bytes: Uint8Array | string,
  name: string,
  type: string,
) {
  const blob = new Blob(
    [typeof bytes === "string" ? bytes : (bytes.slice().buffer as ArrayBuffer)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function inspectInWorker(
  source: Uint8Array,
): Promise<import("./inspect").Inspection> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./inspect.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data.info);
    };
    w.onerror = () => {
      w.terminate();
      reject(Error("Inspection worker failed."));
    };
    w.postMessage(source);
  });
}
export function mergeInWorker(
  source: Uint8Array,
  additional: Uint8Array,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./merge.worker.ts", import.meta.url), {
      type: "module",
    });
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.error) reject(Error(e.data.error));
      else resolve(e.data.bytes);
    };
    w.onerror = () => {
      w.terminate();
      reject(Error("Merge worker failed."));
    };
    w.postMessage({ source, additional });
  });
}
