# Dependency review

Runtime dependencies are bundled into the static application; none is configured
with a remote service, telemetry endpoint or document URL. PDF.js is given a
byte array and same-origin asset directories, with verbosity disabled. Its URL
fetch APIs serve only bundled CMaps/fonts/decoders in this app. PDF annotation
links, XFA and document scripting are not mounted/executed. pdf-lib source parsing
is isolated in workers with console output disabled because malformed-object
warnings can contain source fragments. Application errors use generic messages.
The main thread uses pdf-lib only to create temporary standard-font metrics.

The production Playwright workflow observes requests while loading, correcting,
exporting and recovering a synthetic PDF offline; no third-party requests are
allowed. This is behavioral evidence for the exercised cases, not an assertion
that every PDF feature has been audited. The CSP also blocks third-party requests.
The host necessarily serves and may log static asset requests.

At initial validation, `npm audit --omit=dev` reports zero advisories. The full
build-tool audit reports advisories in transitive minimatch, glob and deepmerge
(and their dependents). Deepmerge currently has no patched release in the
configured registry; the other remediations cross major APIs used by ESLint and
Workbox. These tools do not ship to the browser or process uploaded documents.
Do not force incompatible overrides or conceal advisories to obtain a clean
number. Reassess upstream fixes before publishing. The build does not accept
user-supplied patterns or merge objects for these tools.

Use Node 22.12+, committed npm lockfile, read-only PR CI and SHA-pinned Actions.
Keep library/font license notices in installation-generated public assets and
precache them for offline access. Existing embedded PDF fonts do not confer
permission to redistribute/reuse their outlines; no such reuse is performed.
