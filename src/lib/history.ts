import type { Edit, PageEntry, AuditOperation } from "../pdf/types";
export interface Snapshot {
  edits: Edit[];
  pages: PageEntry[];
  formValues: Record<string, string>;
  operations?: AuditOperation[];
}
export interface History {
  present: Snapshot;
  past: Snapshot[];
  future: Snapshot[];
}
export type HistoryAction =
  | { type: "commit" | "reset"; value: Snapshot; timestamp?: string }
  | { type: "undo" | "redo" };
export function historyReducer(h: History, a: HistoryAction): History {
  switch (a.type) {
    case "reset":
      return { present: a.value, past: [], future: [] };
    case "commit": {
      const operations = [...(h.present.operations || [])];
      if (JSON.stringify(h.present.pages) !== JSON.stringify(a.value.pages))
        operations.push({
          type: "page-structure",
          timestamp: a.timestamp || "unspecified",
          before: h.present.pages,
          after: a.value.pages,
        });
      if (
        JSON.stringify(h.present.formValues) !==
        JSON.stringify(a.value.formValues)
      )
        operations.push({
          type: "form-fill",
          timestamp: a.timestamp || "unspecified",
          before: h.present.formValues,
          after: a.value.formValues,
        });
      return {
        present: { ...a.value, operations },
        past: [...h.past.slice(-49), h.present],
        future: [],
      };
    }
    case "undo":
      return h.past.length
        ? {
            present: h.past.at(-1)!,
            past: h.past.slice(0, -1),
            future: [h.present, ...h.future],
          }
        : h;
    case "redo":
      return h.future.length
        ? {
            present: h.future[0],
            past: [...h.past, h.present],
            future: h.future.slice(1),
          }
        : h;
  }
}
