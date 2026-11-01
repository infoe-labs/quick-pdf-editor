import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName } from "pdf-lib";
import { fixture } from "./fixtures";
import { exportPdf, editGeometry } from "../src/pdf/export";
import { inspect } from "../src/pdf/inspect";
import { inversePoint, point, joinAdjacent } from "../src/pdf/geometry";
import { pixelDiff } from "../src/pdf/diff";
import type { Edit, Fragment, Matrix } from "../src/pdf/types";
const edit: Edit = {
  id: "synthetic-edit",
  pageId: "one",
  page: 1,
  type: "correction",
  original: "2026/10/10",
  replacement: "2026/10/31",
  transform: [14, 0, 0, 14, 110.258, 680],
  width: 70.056,
  height: 14,
  fontId: "Helvetica",
  fontName: "Helvetica",
  fallback: false,
  timestamp: "2026-01-01T00:00:00Z",
};
test("export preserves immutable source, page size, vector streams and audit attachment", async () => {
  const bytes = await fixture();
  const copy = bytes.slice();
  const result = await exportPdf({
    source: bytes,
    pages: [
      { id: "one", source: 0, rotation: 0 },
      { id: "two", source: 1, rotation: 0 },
    ],
    edits: [edit],
    label: true,
  });
  assert.deepEqual(bytes, copy);
  const d = await PDFDocument.load(result);
  assert.equal(d.getPageCount(), 2);
  assert.equal(d.getPage(0).getWidth(), 612);
  assert.equal(d.getTitle(), "Corrected copy");
  assert.ok(d.catalog.get(PDFName.of("Names")));
  const contents = d.getPage(0).node.Contents();
  assert.ok(contents);
});
test("reorder, duplicate and rotate pages without rasterization", async () => {
  const source = await fixture();
  const out = await exportPdf({
    source,
    pages: [
      { id: "two", source: 1, rotation: 90 },
      { id: "one", source: 0, rotation: 0 },
      { id: "three", source: 0, rotation: 180 },
    ],
    edits: [],
    label: true,
  });
  const d = await PDFDocument.load(out);
  assert.equal(d.getPageCount(), 3);
  assert.equal(d.getPage(0).getRotation().angle, 90);
  assert.equal(d.getPage(2).getRotation().angle, 180);
});
test("font and signature diagnostics distinguish resources", async () => {
  const info = await inspect(await fixture("signed"));
  assert.equal(info.signed, true);
  assert.ok(info.fonts[0].length >= 3);
  assert.equal(info.fonts[0][0].embedded, false);
  assert.ok(info.fonts[0].every((f) => f.reusable));
});
test("form values survive export", async () => {
  const source = await fixture("form");
  const out = await exportPdf({
    source,
    pages: [
      { id: "one", source: 0, rotation: 0 },
      { id: "two", source: 1, rotation: 0 },
    ],
    edits: [],
    label: true,
    formValues: { "Synthetic name": "Corrected example" },
  });
  const d = await PDFDocument.load(out);
  assert.equal(
    d.getForm().getTextField("Synthetic name").getText(),
    "Corrected example",
  );
});
test("unsupported transforms and glyphs fail explicitly", async () => {
  assert.throws(() =>
    editGeometry({ ...edit, transform: [14, 0, 3, 14, 0, 0] }),
  );
  const source = await fixture();
  await assert.rejects(() =>
    exportPdf({
      source,
      pages: [{ id: "one", source: 0, rotation: 0 }],
      edits: [{ ...edit, replacement: "漢字" }],
      label: true,
    }),
  );
});
test("coordinate transforms round trip at rotations and scaling", () => {
  for (const m of [
    [2, 0, 0, -2, 0, 792],
    [0, 4, 4, 0, 20, 30],
    [0.7, 0.7, -0.7, 0.7, 80, 15],
  ] as Matrix[]) {
    const p = point(m, 31, 42);
    const q = inversePoint(m, ...p);
    assert.ok(Math.abs(q[0] - 31) < 1e-8 && Math.abs(q[1] - 42) < 1e-8);
  }
});
test("split adjacent runs merge while unrelated lines stay separate", () => {
  const base: Fragment = {
    id: "a",
    page: 1,
    text: "2026/",
    fontId: "f",
    family: "Helvetica",
    transform: [12, 0, 0, 12, 40, 60],
    width: 30,
    height: 12,
    ascent: 0.8,
    direction: "ltr",
  };
  const rs = joinAdjacent([
    base,
    { ...base, id: "b", text: "10/10", transform: [12, 0, 0, 12, 70, 60] },
    { ...base, id: "c", text: "other line", transform: [12, 0, 0, 12, 40, 40] },
  ]);
  assert.equal(rs.length, 2);
  assert.equal(rs[0].text, "2026/10/10");
});
test("pixel diff separates low deltas and outside-region changes", () => {
  const a = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]),
  } as ImageData;
  const b = {
    ...a,
    data: new Uint8ClampedArray([250, 250, 250, 255, 0, 0, 0, 255]),
  } as ImageData;
  const r = pixelDiff(a, b, () => false);
  assert.equal(r.antialias, 1);
  assert.equal(r.outside, 1);
});

test("embedded TrueType, subset and CFF require explicit fallback", async () => {
  for (const kind of ["truetype", "subset", "cff"]) {
    const i = await inspect(await fixture(kind));
    assert.ok(
      i.fonts[0].some((f) => f.embedded && !f.reusable),
      kind,
    );
  }
});

test("longer replacements fit the selected region instead of being rejected", async () => {
  const { prepareCorrection, fitToRegion } =
    await import("../src/pdf/correction");
  const fitted = await prepareCorrection({
    ...edit,
    width: 44.5,
    replacement: "1000000",
    transform: [16, 0, 0, 16, 48, 680],
  });
  assert.ok(fitted.naturalWidth! > 44.5);
  assert.ok(fitted.fitScale! < 1);
  assert.ok(Math.abs(fitted.naturalWidth! * fitted.fitScale! - 44.5) < 1e-8);
  assert.equal(fitToRegion(20, 44.5), 1);
  assert.equal(fitToRegion(0, 44.5), 1);
  const out = await exportPdf({
    source: await fixture(),
    pages: [{ id: "one", source: 0, rotation: 0 }],
    edits: [fitted],
    label: true,
  });
  assert.equal((await PDFDocument.load(out)).getPageCount(), 1);
});
test("affine correction placement supports nonuniform and rotated source text", async () => {
  const { prepareCorrection } = await import("../src/pdf/correction");
  const fitted = await prepareCorrection({
    ...edit,
    transform: [12, 4, 2, 16, 48, 680],
    replacement: "A longer replacement",
  });
  const out = await exportPdf({
    source: await fixture(),
    pages: [{ id: "one", source: 0, rotation: 0 }],
    edits: [fitted],
    label: true,
  });
  assert.ok(out.length > 0);
});
test("automatic color sampling recognizes flat colored backgrounds and strokes", async () => {
  const { samplePixels } = await import("../src/pdf/appearance");
  const data = new Uint8ClampedArray(80 * 40 * 4);
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 80; x++) {
      const i = (y * 80 + x) * 4;
      const ink = x > 25 && x < 35 && y > 10 && y < 25;
      data.set(ink ? [24, 64, 112, 255] : [240, 232, 216, 255], i);
    }
  const result = samplePixels(
    { width: 80, height: 40, data } as ImageData,
    (x, y) => [(x - 10) / 20, (30 - y) / 25],
    3,
    0.8,
  );
  assert.ok(result.confidence > 0.9);
  assert.ok(Math.abs(result.background[0] - 240 / 255) < 0.02);
  assert.ok(result.foreground[2] > result.foreground[0]);
});
