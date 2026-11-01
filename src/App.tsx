import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import {
  FileUp,
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  PanelRightClose,
  ScanText,
  MousePointer2,
  Highlighter,
  PenLine,
  Type,
  ImagePlus,
  Layers,
  ArrowLeftRight,
  Sun,
  Moon,
  ChevronRight,
  RotateCw,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  LockKeyhole,
  FileText,
  Save,
  X,
  Plus,
  Signature,
  Menu,
  Square,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import PdfPage from "./components/PdfPage";
import { openPdf } from "./pdf/load";
import { type Inspection } from "./pdf/inspect";
import {
  buildPdf,
  download,
  inspectInWorker,
  mergeInWorker,
} from "./pdf/client";
import { editGeometry, fallbackName } from "./pdf/export";
import { PDFDocument } from "pdf-lib";
import { extendSelection } from "./pdf/geometry";
import { pixelDiff } from "./pdf/diff";
import type {
  Edit,
  PageEntry,
  Selection,
  Project,
  SourceRecord,
  AuditSegment,
} from "./pdf/types";
import { saveProject, restoreProject, deleteProject } from "./lib/project";
import { pwa } from "./lib/pwa.js";
import { promptInstall, subscribeInstall } from "./lib/install.js";
import { historyReducer, type Snapshot } from "./lib/history";
const uid = () => crypto.randomUUID();
const tools = [
  ["select", "Select", MousePointer2],
  ["inspect", "Inspect", ScanText],
  ["annotation", "Text", Type],
  ["highlight", "Highlight", Highlighter],
  ["draw", "Draw", PenLine],
  ["sign", "Sign", Signature],
  ["image", "Image", ImagePlus],
  ["shape", "Shape", Square],
] as const;
export default function App() {
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [preview, setPreview] = useState<PDFDocumentProxy>();
  const [source, setSource] = useState<Uint8Array>();
  const [originals, setOriginals] = useState<SourceRecord[]>([]);
  const [inheritedHistory, setInheritedHistory] = useState<AuditSegment[]>([]);
  const [name, setName] = useState("");
  const [history, dispatch] = useReducer(historyReducer, {
    present: { edits: [], pages: [], formValues: {} },
    past: [],
    future: [],
  });
  const { present: state, past, future } = history;
  const [info, setInfo] = useState<Inspection>();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [replacement, setReplacement] = useState("");
  const [fallback, setFallback] = useState(false);
  const [white, setWhite] = useState(false);
  const [draft, setDraft] = useState<Edit>();
  const [scale, setScale] = useState(0.9);
  const [tool, setTool] = useState("select");
  const [panel, setPanel] = useState<
    "inspect" | "pages" | "history" | "privacy" | "forms"
  >("inspect");
  const [showPanel, setShowPanel] = useState(() => window.innerWidth > 800);
  const [compare, setCompare] = useState("corrected");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);
  const [current, setCurrent] = useState(1);
  const [remember, setRemember] = useState(false);
  const [recover, setRecover] = useState<Project>();
  const [offline, setOffline] = useState(pwa.ready);
  const [install, setInstall] = useState(false);
  const [update, setUpdate] = useState(false);
  const [diff, setDiff] = useState("");
  const [bytes, setBytes] = useState<Uint8Array>();
  const file = useRef<HTMLInputElement>(null);
  const merge = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLInputElement>(null);
  const imageData = useRef<string | undefined>(undefined);
  const loading = useRef(0);
  const viewer = useRef<HTMLDivElement>(null);

  const touchPoints = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ distance: number; scale: number } | undefined>(
    undefined,
  );
  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((s) =>
          Math.max(0.25, Math.min(8, s * (e.deltaY > 0 ? 0.95 : 1.05))),
        );
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const commit = useCallback((next: Snapshot) => {
    dispatch({
      type: "commit",
      value: next,
      timestamp: new Date().toISOString(),
    });
    setDraft(undefined);
  }, []);
  useEffect(() => {
    void restoreProject()
      .then(setRecover)
      .catch(() =>
        setNotice("Local recovery unavailable; files remain in memory."),
      );
    const changed = () => {
      setOffline(pwa.ready);
      setUpdate(pwa.update);
    };
    pwa.events.addEventListener("change", changed);
    const unsub = subscribeInstall((s: { canPrompt: boolean }) =>
      setInstall(s.canPrompt),
    );
    return () => {
      pwa.events.removeEventListener("change", changed);
      unsub();
    };
  }, []);
  useEffect(
    () => () => {
      void doc?.loadingTask.destroy().catch(() => {});
    },
    [doc],
  );
  useEffect(
    () => () => {
      void preview?.loadingTask.destroy().catch(() => {});
    },
    [preview],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (source) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [source]);
  useEffect(() => {
    if (!remember || !source) return;
    const t = setTimeout(() => {
      void saveProject({
        version: 1,
        originals,
        inheritedHistory,
        operations: state.operations,
        name,
        source,
        edits: state.edits,
        pages: state.pages,
        formValues: state.formValues,
      }).catch(() => {
        setError(
          "Local save failed: storage denied or full. Your working document remains in memory.",
        );
        setRemember(false);
      });
    }, 600);
    return () => clearTimeout(t);
  }, [remember, source, name, state, originals, inheritedHistory]);
  async function load(
    data: Uint8Array,
    filename: string,
    project?: Project,
    mergeContext?: {
      originals: SourceRecord[];
      inheritedHistory: AuditSegment[];
    },
  ) {
    const ticket = ++loading.current;
    setBusy(true);
    setError("");
    try {
      let opened: PDFDocumentProxy;
      try {
        opened = await openPdf(data);
      } catch (e) {
        if (e instanceof Error && e.name === "PasswordException") {
          setError(
            "Password-protected PDF detected. Viewing/editing encrypted documents is not supported by this export engine. Open an authorized decrypted copy.",
          );
          return;
        }
        throw e;
      }
      const inspection = await inspectInWorker(data);
      if (ticket !== loading.current) {
        void opened.loadingTask.destroy();
        return;
      }
      const pages: PageEntry[] = [];
      for (let i = 1; i <= opened.numPages; i++) {
        const p = await opened.getPage(i);
        pages.push({ id: uid(), source: i - 1, rotation: p.rotate });
      }
      setRemember(false);
      setSource(data.slice());
      setOriginals(
        mergeContext?.originals ||
          project?.originals || [{ name: filename, bytes: data.slice() }],
      );
      setInheritedHistory(
        mergeContext?.inheritedHistory || project?.inheritedHistory || [],
      );
      setName(filename);
      setDoc(opened);
      setInfo(inspection);
      dispatch({
        type: "reset",
        value: {
          edits: project?.edits || [],
          pages: project?.pages || pages,
          formValues: project?.formValues || {},
          operations: project?.operations || [],
        },
      });
      setPreview(undefined);
      setBytes(undefined);

      setSelection(null);
      setDraft(undefined);
      setShowPanel(window.innerWidth > 800);
      setCurrent(1);
      setRecover(undefined);
      setNotice(
        inspection.signed
          ? "Digital signature detected. Any modification may invalidate the signature."
          : "Original preserved in memory. Click a word to inspect it; double-click selects a full text run.",
      );
      const firstViewport = (await opened.getPage(1)).getViewport({ scale: 1 });
      const available =
        (viewer.current?.clientWidth || window.innerWidth - 57) -
        (window.innerWidth > 800 ? 72 : 32);
      setScale(Math.min(0.95, Math.max(0.25, available / firstViewport.width)));
    } catch {
      setError(
        "Cannot open this PDF. It may be corrupted, encrypted, or exceed available memory.",
      );
    } finally {
      if (ticket === loading.current) setBusy(false);
    }
  }
  async function onFile(f?: File) {
    if (!f) return;
    if (f.size > 150 * 1024 * 1024) {
      setError(
        "This file exceeds the 150 MB safety limit. Split it locally before opening.",
      );
      return;
    }
    if (
      source &&
      !window.confirm(
        "Open another PDF? Download or save your current work first.",
      )
    )
      return;
    await load(new Uint8Array(await f.arrayBuffer()), f.name);
  }
  // Preview and download share the exact same generated bytes. Abort stale worker work.
  useEffect(() => {
    if (!source || !doc) return;
    setBytes(undefined);
    const controller = new AbortController();
    let generated: PDFDocumentProxy | undefined;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const edits = draft ? [...state.edits, draft] : state.edits;
          const output = await buildPdf(
            {
              source,
              inheritedHistory,
              operations: state.operations,
              pages: state.pages,
              edits,
              label: true,
              formValues: state.formValues,
            },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          generated = await openPdf(output);
          if (controller.signal.aborted) {
            void generated.loadingTask.destroy();
            return;
          }
          setBytes(output);
          setPreview(generated);
        } catch (e) {
          if (!controller.signal.aborted) {
            setBytes(undefined);
            setPreview(undefined);
            setError(e instanceof Error ? e.message : "Preview failed.");
          }
        }
      })();
    }, 220);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [source, doc, state, draft, inheritedHistory]);
  const selectedRef = useRef<Selection | null>(null);
  useEffect(() => {
    selectedRef.current = selection;
  }, [selection]);
  const choose = useCallback((next: Selection, extend?: boolean) => {
    const s =
      extend && selectedRef.current
        ? extendSelection(selectedRef.current, next)
        : next;
    if (!s) {
      setError("Add only nearby, aligned text in the same font and page.");
      return;
    }
    setSelection(s);
    setReplacement(s.original);
    setFallback(false);
    setWhite(false);
    setDraft(undefined);
    setPanel("inspect");
    setShowPanel(true);
  }, []);
  const fonts = info?.fonts[(selection?.page || 1) - 1] || [];
  const cleanFont = (s: string) =>
    s
      .replace(/^[A-Z]{6}\+/, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  const fontMatches = selection?.fontName
    ? fonts.filter((f) => cleanFont(f.name) === cleanFont(selection.fontName!))
    : [];
  const uniqueFonts = [
    ...new Map(
      fonts.map((f) => [`${f.name}:${f.encoding}:${f.embedded}`, f]),
    ).values(),
  ];
  const distinctMatches = [
    ...new Map(
      fontMatches.map((f) => [
        `${f.name}:${f.encoding}:${f.embedded}:${f.subtype}`,
        f,
      ]),
    ).values(),
  ];
  const selectedFont =
    distinctMatches.length === 1
      ? distinctMatches[0]
      : uniqueFonts.length === 1
        ? uniqueFonts[0]
        : undefined;
  function makeEdit(type: Edit["type"], sel: Selection, text: string): Edit {
    return {
      id: uid(),
      pageId:
        sel.pageId ||
        state.pages.find((p) => p.source === sel.page - 1)?.id ||
        state.pages[current - 1].id,
      page: sel.page,
      type,
      original: sel.original,
      replacement: text,
      transform: sel.transform,
      width: sel.width,
      height: sel.height,
      fontId: sel.fontId,
      fontName: selectedFont?.name || sel.family,
      fallback: !selectedFont?.reusable,
      timestamp: new Date().toISOString(),
    };
  }
  async function propose() {
    if (!selection) return;
    setError("");
    if (!white) {
      setError(
        "Confirm that the correction region has a plain white background.",
      );
      return;
    }
    if (!selectedFont?.reusable && !fallback) {
      setError("Explicitly accept the disclosed fallback font first.");
      return;
    }
    try {
      const e = makeEdit("correction", selection, replacement);
      editGeometry(e);
      const d = await PDFDocument.create();
      const f = await d.embedFont(fallbackName(e.fontName));
      const missing = [
        ...new Set(
          Array.from(replacement).filter((c) => {
            try {
              f.encodeText(c);
              return false;
            } catch {
              return true;
            }
          }),
        ),
      ];
      if (missing.length) {
        setError(
          `Replacement glyphs unavailable in ${fallbackName(e.fontName)}: ${missing.join(" ")}. No correction applied.`,
        );
        return;
      }
      if (
        Math.abs(selection.characterSpacing || 0) > 0.001 ||
        Math.abs(selection.wordSpacing || 0) > 0.001
      ) {
        setError(
          "Nonzero character or word spacing detected. Exact spacing-preserving export is unsupported for this run.",
        );
        return;
      }
      f.encodeText(replacement);
      const width = f.widthOfTextAtSize(
        replacement,
        Math.hypot(e.transform[0], e.transform[1]),
      );
      if (width > selection.width + 1) {
        setError(
          `Replacement is ${width.toFixed(1)} pt wide; selected region is ${selection.width.toFixed(1)} pt. Choose a shorter value to avoid covering adjacent content.`,
        );
        return;
      }
      if (
        state.edits.some(
          (x) =>
            x.pageId === e.pageId &&
            x.type === "correction" &&
            Math.hypot(
              x.transform[4] - e.transform[4],
              x.transform[5] - e.transform[5],
            ) < Math.max(e.width, x.width),
        )
      ) {
        setError(
          "This region overlaps an existing correction. Undo or remove that correction first.",
        );
        return;
      }
      setDraft(e);
      setCompare("corrected");
      setNotice(
        "Preview generated from the export engine. Inspect alignment and background before accepting.",
      );
    } catch {
      setError(
        "Replacement glyphs or this transform are unsupported. No correction was applied.",
      );
    }
  }
  function mark(
    entry: PageEntry,
    x: number,
    y: number,
    points?: [number, number][],
  ) {
    if (draft) {
      setError("Accept or reject the proposed correction first.");
      return;
    }
    let text = "";
    if (tool === "annotation") {
      text = window.prompt("Text annotation") || "";
      if (!text) return;
    }
    if (tool === "image" && !imageData.current) {
      image.current?.click();
      setNotice("Choose an image, then click the page to place it.");
      return;
    }
    const e: Edit = {
      id: uid(),
      pageId: entry.id,
      page: entry.source + 1,
      type: points
        ? "draw"
        : tool === "image"
          ? "image"
          : tool === "shape"
            ? "shape"
            : "annotation",
      original: "",
      replacement: text,
      transform: [12, 0, 0, 12, x, y],
      width: tool === "image" ? 140 : 200,
      height: tool === "image" ? 100 : 14,
      fontId: "",
      fontName: "Helvetica",
      fallback: false,
      timestamp: new Date().toISOString(),
      points,
      image: tool === "image" ? imageData.current : undefined,
    };
    commit({ ...state, edits: [...state.edits, e] });
    setCompare("corrected");
  }
  function undo() {
    if (draft) {
      setDraft(undefined);
      return;
    }
    dispatch({ type: "undo" });
    setSelection(null);
  }
  function redo() {
    dispatch({ type: "redo" });
    setSelection(null);
  }
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === "Escape") {
        setDraft(undefined);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  });
  useEffect(() => {
    setCurrent((c) => Math.min(c, Math.max(1, state.pages.length)));
  }, [state.pages.length]);
  function jump(n: number) {
    if (!Number.isFinite(n)) return;
    const next = Math.max(1, Math.min(state.pages.length, n));
    setCurrent(next);
    viewer.current
      ?.querySelectorAll(".comparison-row")
      [next - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function save() {
    if (!source) return;
    setBusy(true);
    setNotice("Saving project on this device…");
    try {
      await saveProject({
        version: 1,
        originals,
        inheritedHistory,
        operations: state.operations,
        name,
        source,
        edits: state.edits,
        pages: state.pages,
        formValues: state.formValues,
      });
      setRemember(true);
      setNotice(
        "Project saved on this device for 7 days; automatic local recovery enabled.",
      );
    } catch {
      setError("Local save failed. Browser storage may be full or disabled.");
    } finally {
      setBusy(false);
    }
  }
  async function mergeFile(f?: File) {
    if (!f || !source || !bytes) return;
    if (
      !window.confirm(
        "Merging creates a new source. Existing page edits will be baked into a corrected copy. Continue?",
      )
    )
      return;
    setBusy(true);
    try {
      const additional = new Uint8Array(await f.arrayBuffer());
      if (
        originals.reduce(
          (n, s) => n + s.bytes.byteLength,
          additional.byteLength,
        ) >
        150 * 1024 * 1024
      )
        throw Error("Memory limit");
      const merged = await mergeInWorker(bytes || source, additional);
      await load(merged, "merged-corrected-copy.pdf", undefined, {
        originals: [...originals, { name: f.name, bytes: additional }],
        inheritedHistory: [
          ...inheritedHistory,
          {
            timestamp: new Date().toISOString(),
            operation: "merge",
            changes: state.edits,
            pages: state.pages,
            formChanges: state.formValues,
            operations: state.operations,
          },
        ],
      });
    } catch {
      setError(
        "Merge failed. Encrypted or unsupported documents cannot be merged.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    if (!doc || !preview) return;
    setBusy(true);
    setDiff("");
    try {
      const index = Math.max(0, current - 1);
      const entry = state.pages[index];
      const a = await doc.getPage(entry.source + 1);
      const b = await preview.getPage(index + 1);
      const v = a.getViewport({ scale: 2, rotation: entry.rotation });
      const c1 = document.createElement("canvas"),
        c2 = document.createElement("canvas");
      if (v.width * v.height > 16000000) throw Error();
      for (const c of [c1, c2]) {
        c.width = Math.ceil(v.width);
        c.height = Math.ceil(v.height);
      }
      await a.render({ canvas: c1, viewport: v, annotationMode: 1 }).promise;
      await b.render({ canvas: c2, viewport: v, annotationMode: 1 }).promise;
      const edits = [...state.edits, ...(draft ? [draft] : [])].filter(
        (e) => e.pageId === entry.id,
      );
      const boxes = edits.map((e) => {
        const [x, y] = v.convertToViewportPoint(e.transform[4], e.transform[5]);
        return {
          x: x - 5,
          y: y - e.height * 2 - 8,
          w: e.width * 2 + 10,
          h: e.height * 2 + 20,
        };
      });
      const report = pixelDiff(
        c1.getContext("2d")!.getImageData(0, 0, c1.width, c1.height),
        c2.getContext("2d")!.getImageData(0, 0, c2.width, c2.height),
        (x, y) =>
          y > v.height - 34 ||
          boxes.some(
            (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
          ),
      );
      setDiff(
        `Page ${current} at 200%: ${report.changed.toLocaleString()} pixels changed above 32/255; ${report.outside.toLocaleString()} outside expected edit/disclosure regions. ${report.antialias.toLocaleString()} low-delta pixels (possible antialiasing; not proof). ${report.outside ? "Review unexpected changes before exporting." : "No high-delta changes detected outside expected regions."}`,
      );
    } catch {
      setDiff(
        "Comparison could not complete within browser limits. Verify the exported PDF independently.",
      );
    } finally {
      setBusy(false);
    }
  }
  const activeDoc = compare === "original" ? doc : preview || doc;
  return (
    <div className="app-shell">
      <input
        ref={file}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={merge}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          void mergeFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={image}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) {
            setError("Image must be under 10 MB.");
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            imageData.current = String(reader.result);
            setNotice(
              "Image ready. Click the page to place a 140 × 100 pt image.",
            );
          };
          reader.readAsDataURL(f);
        }}
      />
      <header className="header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark">
            <FileText size={23} />
          </span>
          <span>
            Precision<span className="brand-light">PDF</span>
            <small>THE LOCAL DOCUMENT STUDIO</small>
          </span>
        </a>
        <button
          className="privacy-pill"
          onClick={() => {
            setPanel("privacy");
            setShowPanel(true);
          }}
        >
          <ShieldCheck size={15} />
          <span>Private & Local — Your PDFs never leave your device.</span>
        </button>
        <div className="header-actions">
          <span className="offline">
            <i />
            {offline ? "Offline ready" : "Local processing"}
          </span>
          <button
            className="icon-button"
            aria-label="Toggle dark mode"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <div className="main-toolbar">
        <div className="toolbar-group">
          <button className="button" onClick={() => file.current?.click()}>
            <FileUp size={16} />
            Open PDF
          </button>
          <button
            className="button subtle"
            disabled={!doc || !!draft || busy}
            onClick={() => void save()}
          >
            <Save size={16} />
            <span>Save project</span>
          </button>
        </div>
        <div className="toolbar-group">
          <button
            className="icon-button"
            aria-label="Undo"
            disabled={!past.length && !draft}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <div className="toolbar-group zoom-controls">
          <button
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
          >
            <ZoomOut size={17} />
          </button>
          <select
            aria-label="Zoom"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            {[...new Set([scale, 0.5, 0.75, 1, 1.5, 2, 4, 8])]
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {Math.round(s * 100)}%
                </option>
              ))}
          </select>
          <button
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => setScale((s) => Math.min(8, s + 0.25))}
          >
            <ZoomIn size={17} />
          </button>
        </div>
        <div className="toolbar-group page-nav">
          <span>Page</span>
          <input
            type="number"
            aria-label="Page number"
            min={1}
            max={state.pages.length || 1}
            value={current}
            onChange={(e) => jump(+e.target.value)}
          />
          <span>/ {state.pages.length || "—"}</span>
        </div>
        <div className="toolbar-spacer" />
        <button
          className={`button subtle ${compare !== "corrected" ? "active" : ""}`}
          disabled={!doc}
          onClick={() => {
            setCompare(compare === "side" ? "corrected" : "side");
          }}
        >
          <ArrowLeftRight size={16} />
          <span>Compare</span>
        </button>
        <button
          className="button primary"
          disabled={!bytes || busy || !!draft}
          onClick={() => {
            if (bytes)
              download(
                bytes,
                `${name.replace(/\.pdf$/i, "")}-corrected-copy.pdf`,
                "application/pdf",
              );
          }}
        >
          <Download size={16} />
          Save as new
        </button>
      </div>
      <div className="workspace">
        <nav className="tool-rail" aria-label="Editing tools">
          {tools.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`tool ${tool === id ? "active" : ""}`}
              aria-label={label}
              title={label}
              disabled={!doc}
              onClick={() => {
                setTool(id);
                if (id === "inspect") setShowPanel(true);
                if (id === "sign")
                  setNotice(
                    "Draw a handwritten signature on the page. This is a visual annotation, not a digital signature.",
                  );
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
          <div className="rail-divider" />
          <button
            className={`tool ${panel === "pages" ? "active" : ""}`}
            aria-label="Manage pages"
            disabled={!doc}
            onClick={() => {
              setPanel("pages");
              setShowPanel(true);
            }}
          >
            <Layers size={20} />
            <span>Pages</span>
          </button>
          <button
            className="tool mobile-panel"
            aria-label="Toggle properties"
            onClick={() => setShowPanel(!showPanel)}
          >
            <Menu size={20} />
          </button>
        </nav>
        <main
          className="document-area"
          ref={viewer}
          onPointerDown={(e) => {
            if (e.pointerType !== "touch") return;
            touchPoints.current.set(e.pointerId, [e.clientX, e.clientY]);
            if (touchPoints.current.size === 2) {
              const [a, b] = [...touchPoints.current.values()];
              pinch.current = {
                distance: Math.hypot(a[0] - b[0], a[1] - b[1]),
                scale,
              };
            }
          }}
          onPointerMove={(e) => {
            if (!touchPoints.current.has(e.pointerId)) return;
            touchPoints.current.set(e.pointerId, [e.clientX, e.clientY]);
            if (
              touchPoints.current.size === 2 &&
              pinch.current &&
              pinch.current.distance > 0
            ) {
              const [a, b] = [...touchPoints.current.values()];
              setScale(
                Math.max(
                  0.25,
                  Math.min(
                    8,
                    (pinch.current.scale *
                      Math.hypot(a[0] - b[0], a[1] - b[1])) /
                      pinch.current.distance,
                  ),
                ),
              );
            }
          }}
          onPointerUp={(e) => {
            touchPoints.current.delete(e.pointerId);
            pinch.current = undefined;
          }}
          onPointerCancel={(e) => {
            touchPoints.current.delete(e.pointerId);
            pinch.current = undefined;
          }}
        >
          <div className="document-heading">
            <div>
              <span className="eyebrow">DOCUMENT WORKSPACE</span>
              <h1>{name || "A little more precision."}</h1>
            </div>
            {doc && (
              <div className="view-switch" aria-label="Comparison mode">
                {[
                  ["original", "Original"],
                  ["corrected", "Corrected"],
                  ["side", "Side by side"],
                  ["overlay", "Overlay"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setCompare(id)}
                    className={compare === id ? "active" : ""}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!doc ? (
            <div
              className="welcome"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="welcome-art">
                <FileText size={74} strokeWidth={1} />
                <span>
                  <ScanText size={26} />
                </span>
              </div>
              <span className="eyebrow">YOUR DOCUMENT. YOUR DEVICE.</span>
              <h2>
                Small corrections.
                <br />
                Carefully preserved.
              </h2>
              <p>
                Inspect the details, propose a correction, and keep the original
                intact. A precise workspace for the documents that matter.
              </p>
              <button
                className="button primary large"
                onClick={() => file.current?.click()}
              >
                <Plus size={19} />
                Open a PDF
              </button>
              <span className="drop-hint">
                or drop a document here · up to 150 MB
              </span>
              <div className="welcome-features">
                <span>
                  <LockKeyhole size={16} /> Entirely on-device
                </span>
                <span>
                  <Layers size={16} /> Vector-preserving export
                </span>
                <span>
                  <Check size={16} /> Transparent change record
                </span>
              </div>
              {recover && (
                <div className="recovery">
                  <p>A saved project is available on this device.</p>
                  <button
                    className="button"
                    onClick={() =>
                      void load(recover.source, recover.name, recover)
                    }
                  >
                    Restore saved project
                  </button>
                  <button
                    className="button subtle"
                    onClick={() => {
                      void deleteProject();
                      setRecover(undefined);
                    }}
                  >
                    Delete saved data
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="document-note">
                <span>
                  <i />
                  {!bytes && compare !== "original"
                    ? "GENERATING EXPORT PREVIEW"
                    : draft
                      ? "UNACCEPTED PREVIEW"
                      : compare === "original"
                        ? "IMMUTABLE ORIGINAL"
                        : "CORRECTED COPY PREVIEW"}
                </span>
                <small>
                  {draft
                    ? "Inspect, then accept in the properties panel."
                    : "Overlay corrections retain underlying content. Not secure redaction."}
                </small>
              </div>
              <div className={`page-list compare-${compare}`}>
                {state.pages.map((entry, index) => (
                  <div className="comparison-row" key={entry.id}>
                    {compare === "side" && doc && (
                      <div>
                        <div className="comparison-label">ORIGINAL</div>
                        <PdfPage
                          doc={doc}
                          entry={entry}
                          number={entry.source + 1}
                          scale={scale}
                        />
                      </div>
                    )}
                    <div className="page-stack">
                      {activeDoc && (
                        <PdfPage
                          doc={activeDoc}
                          sourceDoc={compare !== "original" ? doc : undefined}
                          entry={entry}
                          number={
                            compare === "original"
                              ? entry.source + 1
                              : index + 1
                          }
                          scale={scale}
                          selected={selection}
                          onSelect={choose}
                          tool={tool}
                          onMark={mark}
                        />
                      )}
                      {compare === "overlay" && doc && (
                        <div className="overlay-original">
                          <PdfPage
                            doc={doc}
                            entry={entry}
                            number={entry.source + 1}
                            scale={scale}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
        {showPanel && (
          <aside className="properties">
            <div className="panel-tabs">
              <button
                className={panel === "inspect" ? "active" : ""}
                onClick={() => setPanel("inspect")}
              >
                Properties
              </button>
              <button
                className={panel === "history" ? "active" : ""}
                onClick={() => setPanel("history")}
              >
                Changes <span>{state.edits.length}</span>
              </button>
              <button
                className="icon-button"
                aria-label="Close properties"
                onClick={() => setShowPanel(false)}
              >
                <PanelRightClose size={17} />
              </button>
            </div>
            {panel === "privacy" ? (
              <div className="panel-content">
                <ShieldCheck className="teal" size={29} />
                <h2>Private by design.</h2>
                <p>Private & Local — Your PDFs never leave your device.</p>
                <p>
                  PDF parsing, font inspection, rendering, comparison and export
                  run in browser memory, using locally bundled libraries and
                  workers. No document upload, telemetry, remote fonts, AI APIs,
                  or document logging.
                </p>
                <h3>Storage you control</h3>
                <p>
                  Save project opts into IndexedDB recovery for 7 days from the
                  last save. Files are not stored automatically before this
                  action. Storage is not encrypted and shares the origin’s
                  permissions and quota. Browser eviction may erase it.
                </p>
                <p>
                  Offline caching stores public application assets only.
                  Downloaded files remain wherever you save them.
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={!doc}
                  />
                  Save this project automatically on this device
                </label>
                <button
                  className="button danger"
                  onClick={() => {
                    setRemember(false);
                    void deleteProject()
                      .then(() => {
                        setRemember(false);
                        setRecover(undefined);
                        setNotice(
                          "Saved project data deleted. Working memory and downloaded files are unaffected.",
                        );
                      })
                      .catch(() =>
                        setError(
                          "Could not delete local data. Check browser storage permissions.",
                        ),
                      );
                  }}
                >
                  <Trash2 size={15} />
                  Delete locally stored project data
                </button>
                <h3>Install & work offline</h3>
                <p>
                  Android: use Install app or the browser menu. iPhone/iPad:
                  Safari → Share → Add to Home Screen → Open as Web App. Wait
                  for “Offline ready” before disconnecting.
                </p>
                {install && (
                  <button
                    className="button"
                    onClick={() => void promptInstall()}
                  >
                    Install app
                  </button>
                )}
                <p>
                  Corrections use visible overlays. Original text may remain
                  searchable or recoverable; this is not secure redaction.
                  Signatures may become invalid.
                </p>
              </div>
            ) : panel === "pages" ? (
              <div className="panel-content">
                <span className="eyebrow">DOCUMENT STRUCTURE</span>
                <h2>Manage pages</h2>
                <p>
                  Edits follow their page. Changes are included in the export
                  record.
                </p>
                {state.pages.map((p, i) => (
                  <div className="page-item" key={p.id}>
                    <button onClick={() => jump(i + 1)}>
                      Page {i + 1}
                      <small>
                        Source {p.source + 1} · {p.rotation}°
                      </small>
                    </button>
                    <div>
                      {[
                        [
                          ArrowUp,
                          "Move up",
                          () => {
                            if (!i) return;
                            const pages = [...state.pages];
                            [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]];
                            commit({ ...state, pages });
                          },
                        ],
                        [
                          ArrowDown,
                          "Move down",
                          () => {
                            if (i === state.pages.length - 1) return;
                            const pages = [...state.pages];
                            [pages[i + 1], pages[i]] = [pages[i], pages[i + 1]];
                            commit({ ...state, pages });
                          },
                        ],
                        [
                          RotateCw,
                          "Rotate page",
                          () =>
                            commit({
                              ...state,
                              pages: state.pages.map((q) =>
                                q.id === p.id
                                  ? { ...q, rotation: (q.rotation + 90) % 360 }
                                  : q,
                              ),
                            }),
                        ],
                        [
                          Copy,
                          "Duplicate page",
                          () => {
                            const id = uid();
                            const pages = [...state.pages];
                            pages.splice(i + 1, 0, { ...p, id });
                            commit({
                              ...state,
                              pages,
                              edits: [
                                ...state.edits,
                                ...state.edits
                                  .filter((e) => e.pageId === p.id)
                                  .map((e) => ({
                                    ...e,
                                    id: uid(),
                                    pageId: id,
                                  })),
                              ],
                            });
                          },
                        ],
                        [
                          Trash2,
                          "Delete page",
                          () => {
                            if (state.pages.length > 1)
                              commit({
                                ...state,
                                pages: state.pages.filter((q) => q.id !== p.id),
                                edits: state.edits.filter(
                                  (e) => e.pageId !== p.id,
                                ),
                              });
                          },
                        ],
                      ].map(([Icon, label, fn]) => {
                        const I = Icon as typeof ArrowUp;
                        return (
                          <button
                            key={String(label)}
                            className="icon-button"
                            aria-label={`${label} ${i + 1}`}
                            onClick={fn as () => void}
                          >
                            <I size={14} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button
                  className="button"
                  disabled={!bytes || !!draft || busy}
                  onClick={() => merge.current?.click()}
                >
                  <Plus size={15} />
                  Merge another PDF
                </button>
                <button
                  className="button subtle"
                  disabled={!source || !state.pages.length || !!draft}
                  onClick={() => {
                    if (!source) return;
                    void buildPdf({
                      source,
                      pages: [state.pages[current - 1]],
                      edits: state.edits,
                      label: true,
                    })
                      .then((b) =>
                        download(
                          b,
                          `page-${current}-corrected-copy.pdf`,
                          "application/pdf",
                        ),
                      )
                      .catch(() => setError("Selected-page export failed."));
                  }}
                >
                  Export current page
                </button>
                <button
                  className="button subtle"
                  onClick={() => setPanel("forms")}
                >
                  Supported form fields ({info?.forms.length || 0})
                </button>
              </div>
            ) : panel === "forms" ? (
              <div className="panel-content">
                <h2>Form fields</h2>
                <p>
                  Text and checkbox fields are supported. Other field types
                  remain unchanged.
                </p>
                {info?.forms.map((f) => (
                  <label key={f.name} className="field-label">
                    {f.name}
                    <small>{f.type}</small>
                    <input
                      disabled={
                        !["PDFTextField", "PDFCheckBox"].includes(f.type)
                      }
                      value={state.formValues[f.name] ?? f.value}
                      placeholder={
                        f.type === "PDFCheckBox" ? "true / false" : ""
                      }
                      onChange={(e) =>
                        commit({
                          ...state,
                          formValues: {
                            ...state.formValues,
                            [f.name]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            ) : panel === "history" ? (
              <div className="panel-content">
                <span className="eyebrow">LOCAL CHANGE RECORD</span>
                <h2>A clear paper trail.</h2>
                <p>
                  The source stays intact. Every accepted operation is recorded
                  here and attached to the corrected export.
                </p>
                {state.operations?.map((op, i) => (
                  <article className="history-item" key={`operation-${i}`}>
                    <span className="eyebrow">{op.type}</span>
                    <small>{new Date(op.timestamp).toLocaleString()}</small>
                  </article>
                ))}
                {!state.edits.length && (
                  <p className="empty-note">No accepted edits yet.</p>
                )}
                {state.edits.map((e, i) => (
                  <article className="history-item" key={e.id}>
                    <span className="eyebrow">
                      {String(i + 1).padStart(2, "0")} / {e.type} · PAGE{" "}
                      {e.page}
                    </span>
                    {e.original && <del>{e.original}</del>}
                    <strong>{e.replacement || e.type}</strong>
                    <small>
                      {new Date(e.timestamp).toLocaleString()}
                      {e.fallback ? " · Disclosed font fallback" : ""}
                    </small>
                  </article>
                ))}
                <button
                  className="button"
                  disabled={!source}
                  onClick={() =>
                    download(
                      JSON.stringify(
                        {
                          version: 1,
                          notice:
                            "Corrected copy. Overlays retain original text.",
                          pages: state.pages,
                          changes: state.edits,
                          inheritedHistory,
                          operations: state.operations,
                          formChanges: state.formValues,
                        },
                        null,
                        2,
                      ),
                      "precisionpdf-changes.json",
                      "application/json",
                    )
                  }
                >
                  <Download size={15} />
                  Download change log
                </button>
                <button
                  className="button subtle"
                  disabled={!source}
                  onClick={() =>
                    originals[0] &&
                    download(
                      originals[0].bytes,
                      originals[0].name,
                      "application/pdf",
                    )
                  }
                >
                  Download unchanged original
                </button>
                {originals.slice(1).map((original, i) => (
                  <button
                    key={i}
                    className="button subtle"
                    onClick={() =>
                      download(original.bytes, original.name, "application/pdf")
                    }
                  >
                    Download source {i + 2} unchanged
                  </button>
                ))}
                {inheritedHistory.length > 0 && (
                  <p>
                    {inheritedHistory.length} merge history segments are
                    retained in the attached and downloadable change logs.
                    Source documents remain available unchanged.
                  </p>
                )}
              </div>
            ) : (
              <div className="panel-content">
                <div className="panel-title">
                  <span className="eyebrow">PRECISION INSPECTOR</span>
                  <span className="tag">LOCAL</span>
                </div>
                {selection ? (
                  <>
                    <h2>Text correction</h2>
                    <label className="field-label">
                      ORIGINAL TEXT
                      <div className="original-value">{selection.original}</div>
                    </label>
                    <div className="property-grid">
                      <div>
                        <span>Font</span>
                        <strong>
                          {selectedFont?.name || "Unresolved resource"}
                        </strong>
                      </div>
                      <div>
                        <span>Size</span>
                        <strong>
                          {Math.hypot(
                            selection.transform[0],
                            selection.transform[1],
                          ).toFixed(2)}{" "}
                          pt
                        </strong>
                      </div>
                      <div>
                        <span>Position</span>
                        <strong>
                          {selection.transform[4].toFixed(1)},{" "}
                          {selection.transform[5].toFixed(1)}
                        </strong>
                      </div>
                      <div>
                        <span>Dimensions</span>
                        <strong>
                          {selection.width.toFixed(1)} ×{" "}
                          {selection.height.toFixed(1)}
                        </strong>
                      </div>
                    </div>
                    <div
                      className={`fidelity-note ${selectedFont?.reusable ? "supported" : ""}`}
                    >
                      <ShieldCheck size={17} />
                      <div>
                        <strong>
                          {selectedFont?.reusable
                            ? "Standard font supported"
                            : "Exact glyph reuse not verified"}
                        </strong>
                        <p>
                          {selectedFont?.reason ||
                            "The selected PDF.js font cannot be reliably matched to one resource. Use the explicitly disclosed fallback."}
                        </p>
                      </div>
                    </div>
                    <details>
                      <summary>
                        Advanced font & geometry <ChevronRight size={14} />
                      </summary>
                      <dl>
                        {Object.entries({
                          "PDF.js font ID": selection.fontId,
                          "Resource ID": selectedFont?.id || "Unresolved",
                          Embedded: String(selectedFont?.embedded ?? "Unknown"),
                          Subset: String(selectedFont?.subset ?? "Unknown"),
                          Encoding: selectedFont?.encoding || "Unknown",
                          ToUnicode: String(
                            selectedFont?.toUnicode ?? "Unknown",
                          ),
                          "Width entries": selectedFont?.widths ?? "Unknown",
                          Rotation: `${((Math.atan2(selection.transform[1], selection.transform[0]) * 180) / Math.PI).toFixed(2)}°`,
                          Transform: selection.transform
                            .map((n) => n.toFixed(3))
                            .join(", "),
                          "Character spacing":
                            selection.characterSpacing ?? "Unresolved",
                          "Word spacing": selection.wordSpacing ?? "Unresolved",
                          "Horizontal scale":
                            selection.horizontalScale ?? "Unresolved",
                          "Text rise": selection.textRise ?? "Unresolved",
                          "Glyph map": "No verified embedded mapping",
                          "Hit testing": selection.advances
                            ? "Operator glyph advances; inspect alignment"
                            : "Measured advance approximation; inspect alignment",
                          "Font confidence": selectedFont
                            ? "Matched or sole page resource; verify visually"
                            : "Unresolved",
                        }).map(([k, v]) => (
                          <div key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                    <label className="field-label">
                      PROPOSED REPLACEMENT
                      <textarea
                        value={replacement}
                        onChange={(e) => {
                          setReplacement(e.target.value);
                          setDraft(undefined);
                        }}
                        rows={2}
                        spellCheck={false}
                      />
                    </label>
                    {!selectedFont?.reusable && (
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={fallback}
                          onChange={(e) => setFallback(e.target.checked)}
                        />
                        Use disclosed{" "}
                        {fallbackName(selectedFont?.name || selection.family)}{" "}
                        fallback. Embedded subset coverage is unknown; outlines
                        will not be reused.
                      </label>
                    )}
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={white}
                        onChange={(e) => setWhite(e.target.checked)}
                      />
                      I checked that this region has a plain white background
                      and black text.
                    </label>
                    <p className="small-note">
                      White cover + vector text overlay. Original text remains
                      underneath. Color and background are not automatically
                      matched.
                    </p>
                    {draft ? (
                      <div className="draft-actions">
                        <button
                          className="button primary"
                          disabled={!bytes}
                          onClick={() => {
                            commit({
                              ...state,
                              edits: [...state.edits, draft],
                            });
                            setNotice(
                              "Correction accepted. The exported copy includes a disclosure and change log.",
                            );
                          }}
                        >
                          <Check size={16} />
                          Accept correction
                        </button>
                        <button
                          className="button subtle"
                          onClick={() => setDraft(undefined)}
                        >
                          <X size={15} />
                          Reject
                        </button>
                      </div>
                    ) : (
                      <button
                        className="button primary full"
                        disabled={
                          replacement === selection.original ||
                          !replacement ||
                          busy
                        }
                        onClick={() => void propose()}
                      >
                        Preview correction
                        <ChevronRight size={16} />
                      </button>
                    )}
                    <button
                      className="button subtle full"
                      onClick={() => {
                        const e = makeEdit("highlight", selection, "");
                        commit({ ...state, edits: [...state.edits, e] });
                      }}
                    >
                      Highlight selected text
                    </button>
                  </>
                ) : (
                  <>
                    <h2>
                      Details make
                      <br />
                      the difference.
                    </h2>
                    <div className="selection-illustration">
                      <MousePointer2 size={26} />
                      <span>2026/10/10</span>
                    </div>
                    <p>
                      Select a word on the page to inspect its typography and
                      propose a careful correction.
                    </p>
                    <div className="instruction">
                      <span>01</span>
                      <div>
                        <strong>Select existing text</strong>
                        <p>
                          Click a date or word. Double-click for a full run.
                        </p>
                      </div>
                    </div>
                    <div className="instruction">
                      <span>02</span>
                      <div>
                        <strong>Inspect & compare</strong>
                        <p>
                          Check font support, placement, and the export preview.
                        </p>
                      </div>
                    </div>
                    <div className="instruction">
                      <span>03</span>
                      <div>
                        <strong>Save a corrected copy</strong>
                        <p>
                          Your original remains untouched, with a clear record
                          of edits.
                        </p>
                      </div>
                    </div>
                  </>
                )}
                {doc && (
                  <div className="validation-box">
                    <h3>Visual validation</h3>
                    <p>
                      Compare current page at a fixed 200% resolution.
                      Disclosure footer is an expected change.
                    </p>
                    <button
                      className="button full"
                      disabled={!bytes || !preview || busy}
                      onClick={() => void analyze()}
                    >
                      Analyze pixel differences
                    </button>
                    {diff && <p role="status">{diff}</p>}
                  </div>
                )}
                <div className="panel-bottom">
                  <LockKeyhole size={16} />
                  <span>
                    No uploads. No accounts.
                    <br />
                    Just your document, on your device.
                  </span>
                </div>
              </div>
            )}
          </aside>
        )}
        {!showPanel && (
          <button
            className="reopen-panel icon-button"
            aria-label="Open properties"
            onClick={() => setShowPanel(true)}
          >
            <Menu size={20} />
          </button>
        )}
      </div>
      {(notice || error || busy || update) && (
        <div
          className={`status-message ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{busy ? "Processing locally…" : error || notice}</span>
          {update && (
            <button
              onClick={() => {
                if (
                  !source ||
                  window.confirm(
                    "Save/download your project before reloading. Apply update now?",
                  )
                )
                  void pwa.applyUpdate();
              }}
            >
              Update available
            </button>
          )}
          <button
            aria-label="Dismiss message"
            onClick={() => {
              setNotice("");
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <footer className="footer">
        <span>
          <ShieldCheck size={13} />
          LOCAL WORKSPACE
        </span>
        <span>
          {doc
            ? `${state.pages.length} pages · ${state.edits.length} edits`
            : "Built for careful changes."}
        </span>
        <button
          onClick={() => {
            setPanel("privacy");
            setShowPanel(true);
          }}
        >
          Privacy & offline information
          <ChevronRight size={12} />
        </button>
      </footer>
    </div>
  );
}
