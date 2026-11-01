import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Util, type PDFDocumentProxy } from "pdfjs-dist";
import { availableTextWidth, correctionExtent } from "../pdf/layout";
import { extract } from "../pdf/load";
import { selectWord, inversePoint } from "../pdf/geometry";
import type {
  Fragment,
  Selection,
  PageEntry,
  Matrix,
  Edit,
} from "../pdf/types";
export interface PageProps {
  doc: PDFDocumentProxy;
  sourceDoc?: PDFDocumentProxy;
  entry: PageEntry;
  number: number;
  scale: number;
  selected?: Selection | null;
  onSelect?: (s: Selection, extend?: boolean) => void;
  onVisible?: (n: number) => void;
  editingValue?: string;
  onEditingChange?: (value: string) => void;
  onApply?: () => void;
  onCancel?: () => void;
  editingAppearance?: {
    background: [number, number, number];
    foreground: [number, number, number];
  };
  fitScale?: number;
  editingWidth?: number;
  corrections?: Edit[];
  canApply?: boolean;
  tool?: string;
  onMark?: (
    page: PageEntry,
    x: number,
    y: number,
    points?: [number, number][],
  ) => void;
}
export default function PdfPage({
  doc,
  sourceDoc,
  entry,
  number,
  scale,
  selected,
  onSelect,
  onVisible,
  tool,
  onMark,
  editingValue,
  onEditingChange,
  onApply,
  onCancel,
  editingAppearance,
  fitScale = 1,
  editingWidth,
  corrections = [],
  canApply = false,
}: PageProps) {
  const input = useRef<HTMLInputElement>(null);
  const [inputFocused, setInputFocused] = useState(false);
  useEffect(() => {
    if (selected?.pageId === entry.id && onEditingChange) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    }
  }, [
    selected?.id,
    selected?.offset,
    entry.id,
    onEditingChange ? true : false,
  ]);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState({ width: 612, height: 792 });
  const [runs, setRuns] = useState<Fragment[]>([]);
  const [extracted, setExtracted] = useState(false);
  const [viewport, setViewport] =
    useState<
      ReturnType<
        Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["getViewport"]
      >
    >();
  const [error, setError] = useState("");
  const [ink, setInk] = useState<[number, number][]>([]);
  const points = useRef<[number, number][]>([]);
  useEffect(() => {
    const o = new IntersectionObserver(
      (es) => {
        const v = es[0].isIntersecting;
        setVisible(v);
        if (v) onVisible?.(number);
      },
      { rootMargin: "600px" },
    );
    if (host.current) o.observe(host.current);
    return () => o.disconnect();
  }, [number, onVisible]);
  useEffect(() => {
    let dead = false;
    void doc
      .getPage(number)
      .then((p) => {
        if (!dead) {
          const v = p.getViewport({ scale: 1, rotation: entry.rotation });
          setSize({ width: v.width, height: v.height });
        }
      })
      .catch(() => {
        if (!dead) setError("Page dimensions unavailable.");
      });
    return () => {
      dead = true;
    };
  }, [doc, number, entry.rotation]);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    if (!visible) {
      if (canvas.current) {
        canvas.current.width = 1;
        canvas.current.height = 1;
      }
      return;
    }
    setError("");
    setExtracted(false);
    void (async () => {
      try {
        const page = await doc.getPage(number);
        if (cancelled) return;
        const v = page.getViewport({ scale, rotation: entry.rotation });
        setViewport(v);
        const c = canvas.current!;
        const ratio = Math.min(
          devicePixelRatio || 1,
          2,
          Math.sqrt(16000000 / (v.width * v.height)),
        );
        const backing = document.createElement("canvas");
        backing.width = Math.ceil(v.width * ratio);
        backing.height = Math.ceil(v.height * ratio);
        const render = page.render({
          canvas: backing,
          viewport: v,
          transform: [ratio, 0, 0, ratio, 0, 0],
          annotationMode: 1,
        });
        task = render;
        try {
          await render.promise;
          if (cancelled) return;
          // Swap only complete frames, so live edits never blank the page.
          c.width = backing.width;
          c.height = backing.height;
          c.getContext("2d")!.drawImage(backing, 0, 0);
        } finally {
          backing.width = backing.height = 1;
        }
        if (cancelled) return;
        if (onSelect) {
          const rs = await extract(
            sourceDoc || doc,
            sourceDoc ? entry.source + 1 : number,
          );
          if (!cancelled) {
            setRuns(rs);
            setExtracted(true);
          }
        }
      } catch (e) {
        if (
          !cancelled &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          setError(
            "This page could not be rendered. Unsupported or damaged content.",
          );
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [
    doc,
    sourceDoc,
    number,
    entry.source,
    entry.rotation,
    scale,
    visible,
    onSelect,
  ]);
  function coordinates(e: React.PointerEvent) {
    const r = host.current!.getBoundingClientRect();
    return viewport?.convertToPdfPoint(
      e.clientX - r.left,
      e.clientY - r.top,
    ) as [number, number] | undefined;
  }
  return (
    <section className="page-wrap" aria-label={`Page ${number}`}>
      <div className="page-caption">
        <span>PAGE {number.toString().padStart(2, "0")}</span>
        <span>
          {Math.round(size.width)} × {Math.round(size.height)} pt
        </span>
      </div>
      <div
        ref={host}
        className={`pdf-page tool-${tool}`}
        style={{ width: size.width * scale, height: size.height * scale }}
        onPointerDown={(e) => {
          if (
            !onMark ||
            !["draw", "sign", "annotation", "image", "shape"].includes(
              tool || "",
            )
          )
            return;
          const p = coordinates(e);
          if (!p) return;
          if (tool === "draw" || tool === "sign") {
            points.current = [p];
            setInk([p]);
            e.currentTarget.setPointerCapture(e.pointerId);
          } else onMark(entry, ...p);
        }}
        onPointerMove={(e) => {
          if (points.current.length && e.buttons) {
            const p = coordinates(e);
            if (p && points.current.length < 5000) {
              points.current.push(p);
              setInk([...points.current]);
            }
          }
        }}
        onPointerCancel={() => {
          points.current = [];
          setInk([]);
        }}
        onPointerUp={() => {
          if (points.current.length > 1) {
            onMark?.(
              entry,
              points.current[0][0],
              points.current[0][1],
              points.current,
            );
          }
          points.current = [];
          setInk([]);
        }}
      >
        <canvas
          ref={canvas}
          style={{ width: "100%", height: "100%" }}
          aria-label={`Rendered PDF page ${number}`}
        />
        {error && <p className="page-error">{error}</p>}
        {visible &&
          viewport &&
          onSelect &&
          ["select", "inspect", "highlight"].includes(tool || "select") &&
          runs.map((run) => {
            const m = Util.transform(
              viewport.transform,
              run.transform,
            ) as Matrix;
            const fs = Math.hypot(m[0], m[1]);
            const origSize = Math.hypot(run.transform[0], run.transform[1]);
            const w = run.width * scale;
            return (
              <button
                key={run.id}
                aria-label={`Select ${run.text}`}
                title={run.text}
                className={`text-hit ${""}`}
                style={{
                  width: w,
                  height: fs * 1.2,
                  transform: `matrix(${m[0] / fs},${m[1] / fs},${-m[2] / fs},${-m[3] / fs},${m[4] + m[2] * run.ascent},${m[5] + m[3] * run.ascent})`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = host.current!.getBoundingClientRect();
                  const [localX] = inversePoint(
                    m,
                    e.clientX - rect.left,
                    e.clientY - rect.top,
                  );
                  const fraction = Math.max(0, Math.min(1, (localX * fs) / w));
                  const s = selectWord(
                    run,
                    fraction,
                    e.detail > 1 ? "run" : "word",
                  );
                  if (origSize > 0)
                    onSelect(
                      {
                        ...s,
                        pageId: entry.id,
                        availableWidth: availableTextWidth(
                          s,
                          runs,
                          viewport.viewBox,
                        ),
                      },
                      e.shiftKey,
                    );
                }}
              />
            );
          })}
        {viewport &&
          onSelect &&
          ["select", "inspect", "highlight"].includes(tool || "select") &&
          corrections.map((edit) => {
            const m = Util.transform(viewport.transform, edit.transform);
            const fs = Math.hypot(m[0], m[1]);
            const run =
              runs.find((r) => r.id === edit.sourceRunId) ||
              runs.find(
                (r) =>
                  r.fontId === edit.fontId && r.text.includes(edit.original),
              );
            return (
              <button
                key={edit.id}
                className="text-hit correction-hit"
                aria-label={`Edit ${edit.replacement}`}
                style={{
                  width: correctionExtent(edit) * scale,
                  height: fs * 1.2,
                  transform: `matrix(${m[0] / fs},${m[1] / fs},${-m[2] / fs},${-m[3] / fs},${m[4] + m[2] * (edit.ascent ?? 0.8)},${m[5] + m[3] * (edit.ascent ?? 0.8)})`,
                }}
                onClick={() =>
                  onSelect({
                    id: edit.sourceRunId || run?.id || edit.id,
                    page: edit.page,
                    pageId: entry.id,
                    text: edit.original,
                    original: edit.original,
                    fontId: edit.fontId,
                    family: run?.family || "sans-serif",
                    fontName: run?.fontName,
                    transform: edit.transform,
                    width: edit.width,
                    height: edit.height,
                    ascent: edit.ascent ?? 0.8,
                    direction: run?.direction || "ltr",
                    offset:
                      edit.sourceOffset ??
                      Math.max(0, run?.text.indexOf(edit.original) ?? 0),
                    sourceIds: [edit.sourceRunId || run?.id || edit.id],
                    availableWidth: edit.availableWidth,
                  })
                }
              />
            );
          })}
        {viewport && ink.length > 0 && (
          <svg className="ink-preview" width="100%" height="100%">
            <polyline
              points={ink
                .map((p) => viewport.convertToViewportPoint(...p).join(","))
                .join(" ")}
              fill="none"
              stroke="#173c49"
              strokeWidth={1.5 * scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {viewport &&
          selected &&
          selected.pageId === entry.id &&
          (() => {
            const m = Util.transform(viewport.transform, selected.transform);
            const fs = Math.hypot(m[0], m[1]);
            return (
              <span
                className="selection-outline"
                style={{
                  width: selected.width * scale,
                  height: fs * 1.2,
                  transform: `matrix(${m[0] / fs},${m[1] / fs},${-m[2] / fs},${-m[3] / fs},${m[4] + m[2] * selected.ascent},${m[5] + m[3] * selected.ascent})`,
                }}
              />
            );
          })()}
        {viewport &&
          selected &&
          selected.pageId === entry.id &&
          onEditingChange &&
          (() => {
            const m = Util.transform(viewport.transform, selected.transform);
            const fs = Math.hypot(m[0], m[1]);
            const color = (c: [number, number, number]) =>
              `rgb(${c.map((n) => Math.round(n * 255)).join(",")})`;
            return (
              <>
                <input
                  ref={input}
                  className="inline-text-editor"
                  aria-label="Edit selected text in place"
                  value={editingValue}
                  spellCheck={false}
                  style={{
                    width:
                      ((editingWidth ?? selected.width) * scale) / fitScale + 4,
                    height: fs * 1.2,
                    fontSize: fs,
                    fontFamily: selected.family,
                    background: inputFocused
                      ? color(editingAppearance?.background || [1, 1, 1])
                      : "transparent",
                    color: inputFocused
                      ? color(editingAppearance?.foreground || [0, 0, 0])
                      : "transparent",
                    transform: `matrix(${(m[0] / fs) * fitScale},${(m[1] / fs) * fitScale},${-m[2] / fs},${-m[3] / fs},${m[4] + m[2] * selected.ascent},${m[5] + m[3] * selected.ascent})`,
                  }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onChange={(e) => onEditingChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onApply?.();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      onCancel?.();
                    }
                  }}
                />
                <div
                  className="inline-edit-actions"
                  style={{
                    left: Math.max(0, m[4]),
                    top: Math.max(0, m[5] + fs * 0.45),
                  }}
                >
                  <button
                    aria-label="Apply text change"
                    disabled={!canApply}
                    onClick={onApply}
                  >
                    <Check size={14} />
                    Apply ↵
                  </button>
                  <button aria-label="Cancel text change" onClick={onCancel}>
                    <X size={14} />
                  </button>
                </div>
              </>
            );
          })()}
        {visible && extracted && onSelect && !runs.length && (
          <span className="scan-note">
            No selectable text detected. This page may be scanned.
          </span>
        )}
      </div>
    </section>
  );
}
