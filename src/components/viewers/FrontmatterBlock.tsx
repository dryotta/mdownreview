import { useState } from "react";
import "@/styles/frontmatter.css";

interface Props {
  data: Record<string, unknown>;
}

export function FrontmatterBlock({ data }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="frontmatter-block">
      <div
        className="frontmatter-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="frontmatter-icon">{expanded ? "▾" : "▸"}</span>
        <span>Frontmatter</span>
      </div>
      {expanded && (
        <div className="frontmatter-body">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="frontmatter-row">
              <span className="frontmatter-key">{k}</span>
              <span className="frontmatter-value">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
