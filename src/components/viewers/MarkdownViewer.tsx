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

// Per-block async highlighting — avoids passing an async plugin to react-markdown's runSync pipeline
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

// MD_COMPONENTS at module scope — stable references, no per-render recreation
const MD_COMPONENTS = {
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

export function MarkdownViewer({ content, filePath: _filePath, fileSize }: Props) {
  const { body, data } = useMemo(() => parseFrontmatter(content), [content]);
  const headings = useMemo(() => extractHeadings(body), [body]);

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
          components={MD_COMPONENTS as never}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
