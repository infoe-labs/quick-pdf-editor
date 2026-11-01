import { inspect } from "./inspect";
// PDF parser diagnostics may contain fragments of malformed source objects.
// Keep dependency console output inside this isolated worker disabled.
console.warn = console.info = console.error = console.log = () => {};
self.onmessage = async (event: MessageEvent<Uint8Array>) => {
  try {
    self.postMessage({ info: await inspect(event.data) });
  } catch {
    self.postMessage({
      error: "Font/structure inspection failed. Unsupported or malformed PDF.",
    });
  }
};
