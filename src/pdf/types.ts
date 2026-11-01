export type Matrix = [number, number, number, number, number, number];
export interface Fragment {
  id: string;
  page: number;
  text: string;
  fontId: string;
  family: string;
  fontName?: string;
  advances?: number[];
  characterSpacing?: number;
  wordSpacing?: number;
  horizontalScale?: number;
  textRise?: number;
  transform: Matrix;
  width: number;
  height: number;
  ascent: number;
  direction: string;
}
export interface Selection extends Fragment {
  pageId?: string;
  original: string;
  offset: number;
  sourceIds: string[];
}
export interface FontInfo {
  id: string;
  name: string;
  subtype: string;
  embedded: boolean;
  subset: boolean;
  encoding: string;
  toUnicode: boolean;
  widths: number;
  descriptor: boolean;
  reusable: boolean;
  reason: string;
}
export interface PageEntry {
  id: string;
  source: number;
  rotation: number;
}
export type RGB = [number, number, number];
export interface Edit {
  id: string;
  pageId: string;
  page: number;
  type: "correction" | "annotation" | "highlight" | "draw" | "image" | "shape";
  original: string;
  replacement: string;
  transform: Matrix;
  width: number;
  height: number;
  fontId: string;
  fontName: string;
  fallback: boolean;
  timestamp: string;
  points?: [number, number][];
  image?: string;
  fitScale?: number;
  naturalWidth?: number;
  background?: RGB;
  foreground?: RGB;
  backgroundConfidence?: number;
  ascent?: number;
}
export interface Project {
  version: 1;
  name: string;
  source: Uint8Array;
  edits: Edit[];
  pages: PageEntry[];
  formValues?: Record<string, string>;
  originals?: SourceRecord[];
  inheritedHistory?: AuditSegment[];
  operations?: AuditOperation[];
}
export interface ExportRequest {
  source: Uint8Array;
  pages: PageEntry[];
  edits: Edit[];
  label: boolean;
  inheritedHistory?: AuditSegment[];
  operations?: AuditOperation[];
  formValues?: Record<string, string>;
}

export interface SourceRecord {
  name: string;
  bytes: Uint8Array;
}
export interface AuditSegment {
  timestamp: string;
  operation: "merge";
  changes: Edit[];
  pages: PageEntry[];
  formChanges: Record<string, string>;
  operations?: AuditOperation[];
}

export interface AuditOperation {
  type: "page-structure" | "form-fill";
  timestamp: string;
  before: PageEntry[] | Record<string, string>;
  after: PageEntry[] | Record<string, string>;
}
