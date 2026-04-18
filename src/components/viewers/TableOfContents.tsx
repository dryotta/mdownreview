import "@/styles/toc.css";

interface Heading {
  level: number;
  text: string;
  slug: string;
}

interface Props {
  headings: Heading[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split("\n");
  const headings: Heading[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headings.push({ level, text, slug: slugify(text) });
    }
  }
  return headings;
}

export function TableOfContents({ headings }: Props) {
  if (headings.length < 3) return null;

  return (
    <nav className="toc" aria-label="Table of contents">
      <div className="toc-title">Contents</div>
      <ul className="toc-list">
        {headings.map((h, i) => (
          <li key={i} className={`toc-item toc-level-${h.level}`}>
            <a href={`#${h.slug}`} className="toc-link">
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
