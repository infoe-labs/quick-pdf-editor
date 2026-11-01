# Release validation

Run `npm run check`, then repeat build and browser tests with
`BASE_PATH=/quick-pdf-editor/`. The production precache must include PDF.js's
worker `.mjs`, CMaps, standard fonts, WASM and export worker. Verify a browser
restart offline after **Offline ready**, not merely a tab using warm JS memory.

The Playwright correction test reopens downloaded bytes with pdf-lib, checks
unchanged-original byte identity, analyzes fixed-200% pixel differences outside
the target/footer, observes outbound requests and restores IndexedDB offline.
These checks do not validate printing, digital signatures, every annotation or
all PDF engines. Open representative corrected copies in another independent
PDF viewer before a production release, particularly merged/forms/bookmarked
PDFs. Test real Android Chrome and iOS Safari installation and two-finger zoom.

The footer is a disclosed change in the bottom 16 PDF points and may overlap
original footer content. Correction background colors are estimated from border pixels; textured regions
need visual review. Longer values extend at their natural width by default, with nearby text/page
collisions flagged. Fitting is optional. Edit history is not attached to exports. Pixel thresholds are diagnostics, not guarantees that
all small differences are antialiasing. Rotated edit masks currently use an
axis-aligned estimate; treat flagged differences conservatively.

Publication requires an approved exact repository-local pseudonymous identity,
local hooks, destination verification and protected PR-only main. The source
copy does not establish any of these server/local settings.
