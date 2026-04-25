// MRSF comment + Anchor types — single source of truth for the TS side.
//
// Mirrors the Rust `Anchor` enum from `src-tauri/src/core/types/mod.rs`.
// `kind` discriminator values match the Rust serde wire `anchor_kind`
// (snake_case). Payload shapes mirror the per-variant Rust structs.
//
// Wire-format note: the on-disk MRSF v1.1 layout is FLAT (legacy line
// fields + optional `anchor_kind` + per-variant payload field). The
// `anchor: Anchor` field on `MrsfComment` is the in-memory canonical
// shape; the IPC mock populates it explicitly. `anchor_history` items
// use a fully tagged envelope on the wire (`{anchor_kind, anchor_data}`)
// — that mapping happens at the IPC boundary, not in this type.

export interface ImageRectAnchor {
  x_pct: number;
  y_pct: number;
  w_pct?: number;
  h_pct?: number;
}

export interface CsvCellAnchor {
  row_idx: number;
  col_idx: number;
  col_header: string;
  primary_key_col?: string;
  primary_key_value?: string;
}

export interface JsonPathAnchor {
  json_path: string;
  scalar_text?: string;
}

export interface HtmlRangeAnchor {
  selector_path: string;
  start_offset: number;
  end_offset: number;
  selected_text: string;
}

export interface HtmlElementAnchor {
  selector_path: string;
  tag: string;
  text_preview: string;
}

/**
 * Tagged anchor union. `kind` matches the Rust serde wire `anchor_kind`
 * exactly (snake_case). Payload fields are inlined per variant.
 */
export type Anchor =
  | {
      kind: "line";
      line: number;
      end_line?: number;
      start_column?: number;
      end_column?: number;
      selected_text?: string;
      selected_text_hash?: string;
    }
  | { kind: "file" }
  | ({ kind: "image_rect" } & ImageRectAnchor)
  | ({ kind: "csv_cell" } & CsvCellAnchor)
  | ({ kind: "json_path" } & JsonPathAnchor)
  | ({ kind: "html_range" } & HtmlRangeAnchor)
  | ({ kind: "html_element" } & HtmlElementAnchor);

export interface Reaction {
  user: string;
  kind: string;
  ts: string;
}

export interface MrsfComment {
  id: string;
  author: string;
  timestamp: string;
  text: string;
  resolved: boolean;
  // Legacy v1.0 flat line fields. Rust still emits these in the flat wire
  // layout for `Anchor::Line`; matchers/exporters/threads still read them.
  // For `Anchor::Line` they MUST stay in sync with `anchor`'s payload.
  line?: number;
  end_line?: number;
  start_column?: number;
  end_column?: number;
  selected_text?: string;
  anchored_text?: string;
  selected_text_hash?: string;
  commit?: string;
  type?: "suggestion" | "issue" | "question" | "accuracy" | "style" | "clarity";
  severity?: "low" | "medium" | "high";
  reply_to?: string;
  // Canonical anchor — discriminated union. Replaces the seven flat
  // sibling fields (`anchor_kind`, `image_rect`, `csv_cell`, `json_path`,
  // `html_range`, `html_element`) that lived on this interface in iter 1.
  anchor: Anchor;
  anchor_history?: Anchor[];
  reactions?: Reaction[];
}

export interface MrsfSidecar {
  mrsf_version: string;
  document: string;
  comments: MrsfComment[];
}
