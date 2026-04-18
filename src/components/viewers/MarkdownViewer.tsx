import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { createHighlighter } from "shiki";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl as shellOpen } from "@tauri-apps/plugin-opener";
import {
  useState,
  useEffect,
  isValidElement,
  useMemo,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ExtraProps } from "react-markdown";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { TableOfContents, extractHeadings } from "./TableOfContents";
import { CommentMargin } from "@/components/comments/CommentMargin";
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

// FNV-1a hash — 8 hex chars, same algorithm as the Rust side
function fnv1a8(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Extract plain text from React nodes (for block hash computation)
function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node))
    return extractText((node.props as { children?: ReactNode }).children);
  return "";
}

// Build map: line number → nearest preceding heading slug
function buildHeadingContextMap(content: string): Map<number, string | null> {
  const lines = content.split("\n");
  const map = new Map<number, string | null>();
  let current: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^#{1,6}\s+(.+)$/.exec(lines[i]);
    if (m) {
      current = m[1]
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    }
    map.set(i + 1, current);
  }
  return map;
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

  useEffect(() => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const theme = isDark ? "github-dark" : "github-light";

    getHighlighter()
      .then(async (h) => {
        const result = await h.codeToHtml(code, { lang, theme, defaultColor: false });
        setHtml(result);
      })
      .catch(() => {});
  }, [code, lang]);

  if (html) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <pre>
      <code className={`language-${lang}`}>{code}</code>
    </pre>
  );
}

// Static components that don't need filePath or heading context — kept at module scope
const MD_COMPONENTS_STATIC = {
  img: ({ src, alt, node: _node, ...props }: ComponentPropsWithoutRef<"img"> & ExtraProps) => {
    const resolvedSrc =
      src && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:")
        ? convertFileSrc(src)
        : src;
    return <img src={resolvedSrc} alt={alt ?? ""} {...props} />;
  },
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
        const lang = /language-(\w+)/.exec(className ?? "")?.[1];
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
};

// Build comment-aware block components, memoized by filePath + headingContextMap
function useMarkdownComponents(
  filePath: string,
  headingContextMap: Map<number, string | null>
) {
  return useMemo(() => {
    const makeAnchor = (children: ReactNode, startLine: number) => ({
      blockHash: fnv1a8(extractText(children).replace(/\s+/g, " ").trim()),
      headingContext: headingContextMap.get(startLine) ?? null,
      fallbackLine: startLine,
    });

    type BlockTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

    function makeBlock(Tag: BlockTag) {
      return function BlockWithComment({
        children,
        node,
        ...props
      }: ComponentPropsWithoutRef<BlockTag> & ExtraProps) {
        const line = node?.position?.start.line ?? 0;
        return (
          <div className="comment-block-wrapper">
            <Tag {...(props as ComponentPropsWithoutRef<typeof Tag>)}>{children}</Tag>
            <CommentMargin filePath={filePath} anchor={makeAnchor(children, line)} />
          </div>
        );
      };
    }

    return {
      ...MD_COMPONENTS_STATIC,
      p: makeBlock("p"),
      h1: makeBlock("h1"),
      h2: makeBlock("h2"),
      h3: makeBlock("h3"),
      h4: makeBlock("h4"),
      h5: makeBlock("h5"),
      h6: makeBlock("h6"),
    };
  }, [filePath, headingContextMap]);
}

export function MarkdownViewer({ content, filePath, fileSize }: Props) {
  const { body, data } = useMemo(() => parseFrontmatter(content), [content]);
  const headings = useMemo(() => extractHeadings(body), [body]);
  const headingContextMap = useMemo(() => buildHeadingContextMap(body), [body]);
  const components = useMarkdownComponents(filePath, headingContextMap);

  const showSizeWarning = fileSize !== undefined && fileSize > SIZE_WARN_THRESHOLD;

  return (
    <div className="markdown-viewer">
      {showSizeWarning && (
        <div className="size-warning" role="alert">
          This file is large ({Math.round((fileSize ?? 0) / 1024)} KB) — rendering may be slow
        </div>
      )}
      {data && <FrontmatterBlock data={data} />}
      <TableOfContents headings={headings} />
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={components as never}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
