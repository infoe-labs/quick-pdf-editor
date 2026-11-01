import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
} from "pdf-lib";
const legacyName = "precisionpdf-changes.json";
const text = (value: unknown) =>
  value instanceof PDFString || value instanceof PDFHexString
    ? value.decodeText()
    : undefined;
// Older PrecisionPDF releases attached an app-generated change log. Remove only
// that named attachment on re-export, including its stream; retain other files.
export function removeLegacyChangeLog(doc: PDFDocument) {
  const objects = doc.context.enumerateIndirectObjects();
  const removed = new Set<string>();
  const streams = new Set<PDFRef>();
  for (const [ref, obj] of objects) {
    if (
      !(obj instanceof PDFDict) ||
      obj.get(PDFName.of("Type"))?.toString() !== "/Filespec"
    )
      continue;
    if (
      ![
        text(obj.lookup(PDFName.of("UF"))),
        text(obj.lookup(PDFName.of("F"))),
      ].includes(legacyName)
    )
      continue;
    removed.add(ref.toString());
    const ef = obj.lookup(PDFName.of("EF"));
    if (ef instanceof PDFDict)
      for (const [, v] of ef.entries()) if (v instanceof PDFRef) streams.add(v);
  }
  const names = doc.catalog.lookup(PDFName.of("Names"));
  const embedded =
    names instanceof PDFDict
      ? names.lookup(PDFName.of("EmbeddedFiles"))
      : undefined;
  function prune(node: PDFDict): boolean {
    const entries = node.lookup(PDFName.of("Names"));
    if (entries instanceof PDFArray) {
      for (let i = entries.size() - 2; i >= 0; i -= 2)
        if (
          text(entries.lookup(i)) === legacyName ||
          removed.has(entries.get(i + 1).toString())
        ) {
          entries.remove(i + 1);
          entries.remove(i);
        }
      if (!entries.size()) {
        node.delete(PDFName.of("Names"));
        node.delete(PDFName.of("Limits"));
      } else if (node.has(PDFName.of("Limits")))
        node.set(
          PDFName.of("Limits"),
          doc.context.obj([entries.get(0), entries.get(entries.size() - 2)]),
        );
    }
    const kids = node.lookup(PDFName.of("Kids"));
    if (kids instanceof PDFArray) {
      for (let i = kids.size() - 1; i >= 0; i--) {
        const child = kids.lookup(i);
        if (child instanceof PDFDict && prune(child)) kids.remove(i);
      }
      if (!kids.size()) node.delete(PDFName.of("Kids"));
    }
    return !node.has(PDFName.of("Names")) && !node.has(PDFName.of("Kids"));
  }
  if (
    embedded instanceof PDFDict &&
    prune(embedded) &&
    names instanceof PDFDict
  ) {
    names.delete(PDFName.of("EmbeddedFiles"));
    if (!names.keys().length) doc.catalog.delete(PDFName.of("Names"));
  }
  const af = doc.catalog.lookup(PDFName.of("AF"));
  if (af instanceof PDFArray) {
    for (let i = af.size() - 1; i >= 0; i--)
      if (removed.has(af.get(i).toString())) af.remove(i);
    if (!af.size()) doc.catalog.delete(PDFName.of("AF"));
  }
  for (const stream of streams) {
    const shared = objects.some(([ref, obj]) => {
      if (removed.has(ref.toString()) || !(obj instanceof PDFDict))
        return false;
      const ef = obj.lookup(PDFName.of("EF"));
      return (
        ef instanceof PDFDict &&
        ef.entries().some(([, value]) => value.toString() === stream.toString())
      );
    });
    if (!shared) doc.context.delete(stream);
  }
  for (const [ref] of objects)
    if (removed.has(ref.toString())) doc.context.delete(ref);
}
