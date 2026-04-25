// Group A → Group B stub.
//
// Mirrors the Rust `Anchor` enum from `src-tauri/src/core/types/mod.rs`.
// Group B will migrate consumers (IPC mocks, viewer, store) to this union;
// for now this file just publishes the shape.

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

export interface LineAnchor {
  kind: "line";
  line: number;
  end_line?: number;
  start_column?: number;
  end_column?: number;
  selected_text?: string;
  selected_text_hash?: string;
}

export type Anchor =
  | LineAnchor
  | { kind: "file" }
  | { kind: "image_rect"; payload: ImageRectAnchor }
  | { kind: "csv_cell"; payload: CsvCellAnchor }
  | { kind: "json_path"; payload: JsonPathAnchor }
  | { kind: "html_range"; payload: HtmlRangeAnchor }
  | { kind: "html_element"; payload: HtmlElementAnchor };
