# Synthetic PDF fixtures

No real financial, employment, identity or personal documents belong here.

`npm exec tsx tests/generate.ts` regenerates all fixtures except `password.pdf`.
TrueType data comes from PDF.js Liberation fonts; CFF data comes from the bundled
Foxit standard fonts, with their notices retained under `pdf-assets/standard_fonts`
in the build. `password.pdf` was generated from `financial.pdf` using Ghostscript
with public test passwords `synthetic-password` and `synthetic-owner`. Its only
purpose is testing explicit rejection of encrypted input.

- financial: standard Type 1 Helvetica/Times/Courier, tabular digits, mixed sizes,
  table rules, rotated text, separate adjacent date commands, multiple pages.
- truetype/subset: embedded LiberationSans; subset contains only fixture glyphs.
- cff: embedded Type1C resource based on FoxitSerif.
- form: a supported AcroForm text field.
- signed: an intentionally invalid signature dictionary for detection only.
- scanned: an image-only third page, alongside selectable-text control pages.
- password: encrypted document; passwords are public synthetic test values.

Tests generate fresh deterministic layout fixtures in memory as well as opening
these committed files. Full binary PDF byte determinism is not claimed (PDF
serialization may generate IDs and font resource suffixes). Visual preservation
is compared at a fixed 200% resolution against the same original in one browser.
No actual signature verification, embedded Type 1 PFA/PFB fixture, real scanned
OCR corpus, malformed CMap corpus or complex bidi/ligature fixture is covered yet.
Do not call this corpus a universal compatibility certification.
