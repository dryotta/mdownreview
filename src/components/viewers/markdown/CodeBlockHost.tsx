import { useEffect, useRef, useState, type ReactNode } from "react";
import { copyToClipboard } from "@/lib/tauri-commands";
import { warn } from "@/logger";

// Hover/focus-revealed copy button for fenced code blocks. Lives OUTSIDE the
// shiki <pre> so its background does not collide with shiki's themed surface
// — see #65 G2. The clipboard call is routed through `copyToClipboard`, the
// project's chokepoint over `@tauri-apps/plugin-clipboard-manager` (see
// docs/architecture.md). The "Copied" affordance reverts after 1.5s; we
// store the timer in a ref so vi.useFakeTimers() based unit tests are
// deterministic and unmount cleanup is robust.
export function CodeBlockHost({
  source,
  children,
}: {
  source: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const handleCopy = () => {
    copyToClipboard(source)
      .then(() => {
        setCopied(true);
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, 1500);
      })
      .catch((e) => warn(`CodeBlockHost: copy failed: ${String(e)}`));
  };

  return (
    <div className="code-block-host">
      {children}
      <button
        type="button"
        className="code-copy-btn"
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
