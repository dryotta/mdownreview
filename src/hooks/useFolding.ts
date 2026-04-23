import { useState, useMemo, useEffect } from "react";
import { computeFoldRegions, type FoldRegion } from "@/lib/fold-regions";

export function useFolding(lines: string[], filePath: string) {
  const [collapsedLines, setCollapsedLines] = useState<Set<number>>(new Set());

  const foldRegions = useMemo(() => computeFoldRegions(lines), [lines]);

  const foldStartMap = useMemo(() => {
    const m = new Map<number, FoldRegion>();
    foldRegions.forEach((r) => {
      if (!m.has(r.startLine) || m.get(r.startLine)!.endLine < r.endLine) {
        m.set(r.startLine, r);
      }
    });
    return m;
  }, [foldRegions]);

  const toggleFold = (lineNum: number) => {
    setCollapsedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineNum)) next.delete(lineNum);
      else next.add(lineNum);
      return next;
    });
  };

  // Reset folds when file changes
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when filePath prop changes
  useEffect(() => { setCollapsedLines(new Set()); }, [filePath]);

  return { collapsedLines, foldStartMap, toggleFold };
}
