import "@/styles/viewer-toolbar.css";
import { ZoomControl } from "./ZoomControl";

/**
 * L5 — share the same prop shape as `ZoomControl`. Callers spread it directly
 * into `<ZoomControl {...zoom} />` rather than re-wrapping.
 */
export interface ZoomProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

interface Props {
  activeView: "source" | "visual";
  onViewChange: (view: "source" | "visual") => void;
  hidden?: boolean;
  showWrapToggle?: boolean;
  wordWrap?: boolean;
  onToggleWrap?: () => void;
  zoom?: ZoomProps;
}

export function ViewerToolbar({ activeView, onViewChange, hidden, showWrapToggle, wordWrap, onToggleWrap, zoom }: Props) {
  if (hidden && !showWrapToggle && !zoom) return null;

  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="View mode">
      {!hidden && (
        <div className="viewer-toolbar-toggle">
          <button
            className={`viewer-toolbar-btn${activeView === "source" ? " active" : ""}`}
            onClick={() => onViewChange("source")}
            aria-pressed={activeView === "source"}
          >
            Source
          </button>
          <button
            className={`viewer-toolbar-btn${activeView === "visual" ? " active" : ""}`}
            onClick={() => onViewChange("visual")}
            aria-pressed={activeView === "visual"}
          >
            Visual
          </button>
        </div>
      )}
      {showWrapToggle && (
        <button
          className={`viewer-toolbar-btn viewer-toolbar-wrap${wordWrap ? " active" : ""}`}
          onClick={onToggleWrap}
          aria-pressed={wordWrap}
          title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
        >
          Wrap
        </button>
      )}
      {zoom && <ZoomControl {...zoom} />}
    </div>
  );
}
