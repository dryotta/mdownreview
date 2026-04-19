import "@/styles/viewer-toolbar.css";

interface Props {
  activeView: "source" | "visual";
  onViewChange: (view: "source" | "visual") => void;
  hidden?: boolean;
}

export function ViewerToolbar({ activeView, onViewChange, hidden }: Props) {
  if (hidden) return null;

  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="View mode">
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
    </div>
  );
}
