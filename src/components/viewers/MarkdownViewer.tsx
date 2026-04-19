import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { createHighlighter } from "shiki";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl as shellOpen } from "@tauri-apps/plugin-opener";
import {
  useState,
  useEffect,
  useRef,
  isValidElement,
  useMemo,
  createContext,
  useContext,
  useCallback,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ExtraProps } from "react-markdown";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { TableOfContents, extractHeadings } from "./TableOfContents";
import { LineCommentMargin } from "@/components/comments/LineCommentMargin";
import { CommentThread } from "@/components/comments/CommentThread";
import { matchComments } from "@/lib/comment-matching";
import { useStore } from "@/store";
import type { CommentWithOrphan } from "@/store";
import { loadReviewComments, saveReviewComments } from "@/lib/tauri-commands";
import { dirname } from "@/lib/path-utils";
import "@/styles/markdown.css";

const SIZE_WARN_THRESHOLD = 500 * 1024;

interface Props {
  content: string;
  filePath: string;
  fileSize?: number;
}

function parseFrontmatter(content: string): {
  body: string;
  data: Record<string, unknown> | null;
} {
  if (!content.startsWith("---")) return { body: content, data: null };
  const end = content.indexOf("\n---", 4);
  if (end === -1) return { body: content, data: null };
  const yaml = content.slice(4, end);
  const body = content.slice(end + 4).trimStart();
  const data: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key) data[key] = value;
  }
  return { body, data };
}

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: [],
    });
  }
  return highlighterPromise;
}

function HighlightedCode({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);

  // Track data-theme for reactive re-highlighting
  const [currentTheme, setCurrentTheme] = useState(
    () => document.documentElement.getAttribute("data-theme") ?? "light"
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setCurrentTheme(document.documentElement.getAttribute("data-theme") ?? "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const theme = currentTheme === "dark" ? "github-dark" : "github-light";

    getHighlighter()
      .then(async (h) => {
        const result = await h.codeToHtml(code, { lang, theme, defaultColor: false });
        setHtml(result);
      })
      .catch(() => {});
  }, [code, lang, currentTheme]);

  if (html) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <pre>
      <code className={`language-${lang}`}>{code}</code>
    </pre>
  );
}

// Context for inline comment gutters in markdown blocks
interface MdCommentContextValue {
  onClickLine: (line: number) => void;
  commentCountByLine: Map<number, number>;
}

const MdCommentContext = createContext<MdCommentContextValue>({
  onClickLine: () => {},
  commentCountByLine: new Map(),
});

// Inline gutter component for commentable markdown blocks
function makeCommentableBlock(Tag: string) {
  return function CommentableBlock({ children, node, ...props }: ComponentPropsWithoutRef<any> & ExtraProps) {
    const line = node?.position?.start.line ?? 0;
    const { onClickLine, commentCountByLine } = useContext(MdCommentContext);
    const count = commentCountByLine.get(line) ?? 0;

    return (
      <div className="md-commentable-block" data-source-line={line}>
        <span className="md-block-gutter" onClick={(e) => { e.stopPropagation(); onClickLine(line); }}>
          <span className={`md-gutter-btn${count > 0 ? " has-comments" : ""}`}>
            {count > 0 ? count : "+"}
          </span>
        </span>
        <Tag {...props}>{children}</Tag>
      </div>
    );
  };
}

function CommentableLi({ children, node, ...props }: ComponentPropsWithoutRef<"li"> & ExtraProps) {
  const line = node?.position?.start.line ?? 0;
  const { onClickLine, commentCountByLine } = useContext(MdCommentContext);
  const count = commentCountByLine.get(line) ?? 0;

  return (
    <li {...props} data-source-line={line} className="md-commentable-li">
      <span className="md-block-gutter" onClick={(e) => { e.stopPropagation(); onClickLine(line); }}>
        <span className={`md-gutter-btn${count > 0 ? " has-comments" : ""}`}>
          {count > 0 ? count : "+"}
        </span>
      </span>
      {children}
    </li>
  );
}

// Module-scope components — no dependency on filePath or per-render state
const MD_COMPONENTS: Record<string, unknown> = {
  a: ({ href, children, node: _node, ...props }: ComponentPropsWithoutRef<"a"> & ExtraProps) => {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (href) {
        e.preventDefault();
        shellOpen(href).catch(() => {});
      }
    };
    return (
      <a href={href} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  },
  pre: ({ children, node: _node, ...props }: ComponentPropsWithoutRef<"pre"> & ExtraProps) => {
    if (isValidElement(children)) {
      const el = children as ReactElement<{ className?: string; children?: ReactNode }>;
      if (el.type === "code") {
        const { className, children: codeChildren } = el.props;
        const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
        if (lang) {
          return (
            <HighlightedCode
              code={String(codeChildren ?? "").replace(/\n$/, "")}
              lang={lang}
            />
          );
        }
      }
    }
    return <pre {...props}>{children}</pre>;
  },
  p: makeCommentableBlock("p"),
  h1: makeCommentableBlock("h1"),
  h2: makeCommentableBlock("h2"),
  h3: makeCommentableBlock("h3"),
  h4: makeCommentableBlock("h4"),
  h5: makeCommentableBlock("h5"),
  h6: makeCommentableBlock("h6"),
  li: CommentableLi,
};

export function MarkdownViewer({ content, filePath, fileSize }: Props) {
  const { body, data } = useMemo(() => parseFrontmatter(content), [content]);
  const headings = useMemo(() => extractHeadings(body), [body]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [expandedLine, setExpandedLine] = useState<number | null>(null);

  const lines = useMemo(() => body.split("\n"), [body]);

  const setFileComments = useStore((s) => s.setFileComments);
  const comments = useStore((s) => s.commentsByFile[filePath]);
  const loadedRef = useRef<string | null>(null);

  const matchedComments = useMemo(() => {
    if (!comments || comments.length === 0) return [];
    return matchComments(comments, lines);
  }, [comments, lines]);

  const commentsByLine = useMemo(() => {
    const map = new Map<number, CommentWithOrphan[]>();
    for (const c of matchedComments) {
      const ln = c.matchedLineNumber ?? c.lineNumber ?? 1;
      const arr = map.get(ln) ?? [];
      arr.push(c);
      map.set(ln, arr);
    }
    return map;
  }, [matchedComments]);

  // Build components with img resolver (only img depends on filePath)
  const components = useMemo(() => ({
    ...MD_COMPONENTS,
    img: ({ src, alt, node: _node, ...props }: ComponentPropsWithoutRef<"img"> & ExtraProps) => {
      let resolvedSrc = src;
      if (src && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:")) {
        const fileDir = dirname(filePath);
        const absolute = src.startsWith("/") || src.startsWith("\\") || /^[a-zA-Z]:/.test(src)
          ? src
          : `${fileDir}/${src}`;
        resolvedSrc = convertFileSrc(absolute);
      }
      return <img src={resolvedSrc} alt={alt ?? ""} {...props} />;
    },
  }), [filePath]);

  // Load comments from sidecar on file open
  useEffect(() => {
    let cancelled = false;
    loadedRef.current = null;
    loadReviewComments(filePath)
      .then((result) => {
        if (!cancelled && result?.comments) {
          setFileComments(filePath, result.comments);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) loadedRef.current = filePath;
      });
    return () => { cancelled = true; };
  }, [filePath, setFileComments]);

  // Auto-save comments to sidecar (debounced, only after initial load)
  useEffect(() => {
    if (loadedRef.current !== filePath) return;
    const timer = setTimeout(() => {
      saveReviewComments(filePath, comments ?? []).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [comments, filePath]);

  // Scroll-to-line from CommentsPanel click
  useEffect(() => {
    const handler = (e: Event) => {
      const line = (e as CustomEvent).detail.line;
      const el = bodyRef.current?.querySelector(`[data-source-line="${line}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("comment-flash");
        setTimeout(() => el.classList.remove("comment-flash"), 1500);
      }
      setExpandedLine(line);
      setCommentingLine(null);
    };
    window.addEventListener("scroll-to-line", handler);
    return () => window.removeEventListener("scroll-to-line", handler);
  }, []);

  const showSizeWarning = fileSize !== undefined && fileSize > SIZE_WARN_THRESHOLD;

  const commentCountByLine = useMemo(() => {
    const map = new Map<number, number>();
    for (const [ln, cmts] of commentsByLine) {
      map.set(ln, cmts.filter(c => !c.resolved).length);
    }
    return map;
  }, [commentsByLine]);

  const handleLineClick = useCallback((line: number) => {
    const lineComments = commentsByLine.get(line) ?? [];
    if (lineComments.length > 0) {
      setExpandedLine(expandedLine === line ? null : line);
      setCommentingLine(null);
    } else {
      setCommentingLine(commentingLine === line ? null : line);
      setExpandedLine(null);
    }
  }, [commentsByLine, expandedLine, commentingLine]);

  const contextValue = useMemo(() => ({
    onClickLine: handleLineClick,
    commentCountByLine,
  }), [handleLineClick, commentCountByLine]);

  return (
    <div className="markdown-viewer">
      {showSizeWarning && (
        <div className="size-warning" role="alert">
          This file is large ({Math.round((fileSize ?? 0) / 1024)} KB) — rendering may be slow
        </div>
      )}
      {data && <FrontmatterBlock data={data} />}
      <TableOfContents headings={headings} />
      <MdCommentContext.Provider value={contextValue}>
        <div
          className="markdown-body"
          ref={bodyRef}
          style={{ position: "relative" }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            components={components as never}
          >
            {body}
          </ReactMarkdown>

          {/* Comment popover for expanded/commenting line */}
          {(expandedLine !== null || commentingLine !== null) && (() => {
            const activeLine = expandedLine ?? commentingLine;
            if (!activeLine) return null;
            const el = bodyRef.current?.querySelector(`[data-source-line="${activeLine}"]`);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            const containerRect = bodyRef.current!.getBoundingClientRect();
            const lineComments = commentsByLine.get(activeLine) ?? [];

            return (
              <div className="md-comment-popover" style={{
                position: "absolute",
                top: rect.top - containerRect.top + rect.height,
                left: 24,
                zIndex: 20,
              }}>
                {lineComments.length > 0 && (
                  <div className="md-comment-threads">
                    {lineComments.map(c => <CommentThread key={c.id} comment={c} />)}
                  </div>
                )}

                {commentingLine === activeLine ? (
                  <LineCommentMargin
                    filePath={filePath}
                    lineNumber={activeLine}
                    lineText={lines[activeLine - 1] ?? ""}
                    fileLines={lines}
                    matchedComments={[]}
                    showInput={true}
                    onCloseInput={() => { setCommentingLine(null); setExpandedLine(null); }}
                  />
                ) : (
                  <button
                    className="comment-btn comment-btn-primary"
                    style={{ marginTop: 8 }}
                    onClick={() => setCommentingLine(activeLine)}
                  >
                    Add comment
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </MdCommentContext.Provider>
    </div>
  );
}
