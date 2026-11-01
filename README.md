# PrecisionPDF

**Live site: [PrecisionPDF on GitHub Pages](https://infoe-labs.github.io/quick-pdf-editor/)**

A static, local-first PDF inspection and correction studio. React, strict TypeScript,
Vite, locally compiled Tailwind, PDF.js and pdf-lib. Deployable beneath a GitHub
Pages repository path; no backend or account is required.

**Private & Local — Your PDFs never leave your device.**

## Run

Use Node **22.12+** and npm. The committed lockfile controls dependency versions.

```sh
npm ci
npm run dev
```

`postinstall` copies PDF.js CMaps, standard fonts and WASM decoders into local
public assets. These assets are included in the offline application; no CDN is
used. The generated directory is intentionally ignored. To serve production:

```sh
npm run build
npm run preview
```

## Correction workflow

1. Open a PDF, then click the text you want to change. A focused editor opens
   directly over the selected word. Double-click selects the entire extracted run;
   Shift-click adds nearby aligned text in the same font.
2. Type the new value on the page. Preview generation starts automatically. Longer
   replacements fit horizontally inside the existing region while retaining the
   original baseline and text height. There is no "choose a shorter value" gate.
3. Press **Enter** or click **Apply** beside the text. Escape/Cancel discards the
   draft. Click an accepted correction again to revise it. Undo/redo stays available.
4. Use **Save as new** to download a separate `*-corrected-copy.pdf`. Each page has
   a visible correction footer and an attached JSON change record. The Changes
   panel offers the log and byte-identical unchanged originals separately.

Source text/background colors are estimated locally from rendered pixels. Solid
backgrounds are detected automatically; complex backgrounds get an explicit review
notice. Standard source fonts are matched where supported. Other resources use a
named compatible fallback automatically, displayed in Properties; embedded font
outlines are not reused. Unsupported replacement characters are identified instead
of silently exporting missing glyphs. Strong horizontal compression can reduce
legibility; the fitting percentage is displayed. This is fitting, not paragraph
reflow or proof of original typography equivalence.

While the on-page input has focus, it is an editing control. Blur it or use
side-by-side/overlay comparison to inspect the generated vector PDF preview.
Font/resource inspection remains available without blocking the basic edit flow.
Affine correction placement preserves rotation, nonuniform scale and skew when
selection geometry is available. Source spacing is normalized to the fitted value.

The correction footer occupies the bottom **16 PDF points** of each exported page
and may cover existing footer content: inspect it before export. Overlay corrections
retain underlying source text; this is **not deletion or secure redaction**. A
modified financial record is always exported as a disclosed corrected copy.

## Working capabilities

- Multipage PDF rendering in a local PDF.js worker; text/word selection and font
  dictionary inspection, including descendant font descriptors.
- Operator glyph advances when an extracted run can be matched; measured font
  advances otherwise. Arbitrary ligature/bidi/vertical glyph mapping is unresolved.
- Worker-based vector overlay export preserving the source page objects and
  unrelated content streams; no full-page screenshot conversion.
- Same export bytes used for the preview and the downloaded corrected copy.
- Original/corrected, side-by-side and 50% overlay comparisons. Fixed 200% pixel
  comparison reports high-delta changes outside the expected edit/footer regions.
  Deltas of 1–32 are separately reported as *possible* antialiasing artifacts,
  not automatically dismissed. Reports are per current page, not certification.
- Undo/redo (50 in-memory snapshots), page reorder/rotation/duplication/deletion,
  merge, current-page extraction, text annotations, translucent highlights,
  rectangles, freehand drawing, handwritten signature marks, PNG/JPEG insertion.
  Images are placed at 140 × 100 points; handwriting is not a digital signature.
- Supported AcroForm text and checkbox fields (checkbox values `true`/`false`).
- Responsive interface, dark theme, keyboard focus, Ctrl/Cmd-Z, Shift-Z, Escape,
  wheel zoom, touch scrolling and two-pointer document scaling.
- Optional local project save/recovery and scoped deletion, install guidance,
  offline app shell, and explicit update acceptance.

### Compatibility limits

This is a working initial editor, **not completion of every advanced feature in
its design brief**. OCR, arbitrary original-font glyph reuse/content-stream text
rewriting, comprehensive CMap decoding, automatic font matching, secure redaction,
arbitrary line/multi-font corrections, annotation resize handles, digital signing,
whole-document automatic comparison, and universal PDF compatibility are not
implemented. Scans can be rendered/annotated but have no editable text layer.

Password-protected/encrypted input is rejected with guidance to use an authorized
decrypted copy; `ignoreEncryption` is never used. Signed PDFs are detected
structurally; this does not validate their cryptographic signatures. Edits may
invalidate signatures. XFA and document JavaScript are not executed. Bookmark,
link, tagging, accessibility-tree, portfolio, optional-content and duplicated form
relationships are not guaranteed after page restructuring or merging. Form
changes use pdf-lib appearance generation. Review forms and navigation externally.

Files above 150 MB are rejected to limit memory pressure. Offscreen canvas pixels
are released, visible backing buffers are capped at 16 million pixels and DPR 2,
and stale export workers/render tasks are cancelled. This bounds canvas memory,
not all PDF parser memory; very large/vector-heavy files can still fail. The page
shell list is not fully virtualized. High zoom may have reduced effective pixel
resolution because of the canvas cap. Browser canvas extraction cannot prove
printing, accessibility or font equivalence in another viewer.

## Privacy and retention

The browser fetches only static application assets from its own host. PDF bytes,
text, images and edits are never put in a URL, uploaded, logged, or sent to a
service. There is no analytics, cloud OCR, AI API, remote font, authentication,
remote logging or runtime CDN. Export and PDF parsing use local workers. A CSP
blocks third-party connections, document embeds and form submission. No PDF
annotation link or document-script execution layer is mounted.

Documents remain in memory until the tab closes or a different source opens.
**Save project** explicitly opts into IndexedDB storage and subsequent local
autosaves. Saved data includes the original PDF, filename, page structure, edits,
form values and inserted images. Merging keeps unchanged downloads of every imported source and retains prior change
segments in the combined audit record. One current project is retained for seven days
from its last save; expiry is enforced when storage is accessed, not by a closed
browser background task. Restoring does not automatically re-enable autosave.
Unaccepted correction drafts are intentionally not saved. Memory-only work does
not survive refresh; save before reloading. Updates never reload automatically.

**Privacy → Delete locally stored project data** deletes this app's project
namespace only and disables autosave. It does not delete current in-memory work,
downloaded files or other same-origin applications. Application caches contain
only public build assets. Storage is unencrypted; same-origin scripts and browser
extensions may access it. Separate origins are needed for security isolation.
Browser storage quotas/eviction are origin-wide; local save is not a backup.
See [storage contract](docs/STORAGE.md) for namespace and migration details.

The deployment host sees ordinary application-asset requests and may keep its
own access logs. The privacy guarantee concerns documents processed by this app;
it does not remove host/browser/OS data handling. Test only synthetic documents.

## Tests and deployment

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
BASE_PATH=/quick-pdf-editor/ npm run build
BASE_PATH=/quick-pdf-editor/ npm run test:e2e
```

Tests cover immutable bytes, source structure, coordinates, font diagnostics,
encoding failure, automatic text fitting and color sampling, page operations, forms, storage isolation/expiry, a real date
correction/download/reopen flow, fixed-resolution pixel preservation outside
correction regions, network requests, mobile UI and offline recovery. Synthetic
fixtures include standard Type 1 fonts, proportional/monospaced text, tables,
rotated/split text, embedded TrueType/full subset fonts, embedded CFF, image-only
pages, forms, a synthetic signature dictionary and password protection. A
synthetic signature fixture is deliberately not a valid signed document.
See [fixture notes](tests/fixtures/README.md) for remaining coverage gaps.
Chromium automation does not constitute real Android/iOS installation testing.

The Actions workflow builds/tests pull requests with read-only permissions and
only deploys trusted `main`. It derives `/REPOSITORY/` automatically; set the
Actions variable `BASE_PATH=/` for a custom domain. Configure Pages to use GitHub
Actions. The manifest, worker scope, asset URLs and storage scope follow this base.
A source checkout does not configure Pages, branch protection or Git identities.
See [repository setup](docs/REPOSITORY_SETUP.md) before publication. No deployment
or commit identity is implied by copying this base layer.

## Architecture and dependency decisions

`src/pdf/load.ts` owns PDF.js loading/extraction; `text-metrics.ts` isolates the
operator-list adapter; `geometry.ts` owns user-space selection geometry;
`appearance.ts` samples local colors; `correction.ts` prepares fitted text;
`inspect.ts` reads font/signature/form dictionaries; `export.ts` implements vector
edits and disclosures inside `export.worker.ts`; `client.ts` handles cancellation
and download; `diff.ts` compares pixels. `PdfPage.tsx` maps PDF viewport transforms
to selectable overlays and lazily allocated canvases. Storage and PWA lifecycle
adapters come from the reusable base layer.

PDF.js (Apache-2.0) provides maintained rendering, extraction and bundled font/WASM
resources. pdf-lib (MIT, established but slower release cadence) provides
compatible document manipulation; its limitations around existing text and
encryption are intentionally enforced. React (MIT), Tailwind (MIT) and Lucide
(ISC) are bundled locally. Base shadcn source (MIT) remains available for extension.
No canvas framework is needed: viewport-transformed DOM selection and SVG live
ink preserve one coordinate model without another rendering dependency. OCR is
not bundled because language packs/runtime caching need a separate reviewed
retention and licensing contract. No proprietary SDK is used.

Upstream references: [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/api.js.html),
[PDF.js licensing](https://github.com/mozilla/pdf.js/blob/master/LICENSE),
[pdf-lib limitations](https://github.com/Hopding/pdf-lib#limitations).
PDF.js is upgraded past the affected versions in
[GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j).
Runtime license texts are copied to `public/licenses` at install; decoder/font
notices accompany their files. Run `npm audit` when updating dependencies and
review development-tool advisories separately from shipped code; see
[dependency review](docs/DEPENDENCIES.md).
