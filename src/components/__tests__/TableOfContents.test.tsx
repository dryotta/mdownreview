import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TableOfContents, extractHeadings } from "../viewers/TableOfContents";

// ─── 10.7: TableOfContents ────────────────────────────────────────────────────

describe("10.7 – TableOfContents", () => {
  it("does not render for fewer than 3 headings", () => {
    const headings = extractHeadings("# H1\n\n## H2\n\nContent");
    const { container } = render(<TableOfContents headings={headings} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nav element with 3+ headings", () => {
    const headings = extractHeadings("# H1\n\n## H2\n\n### H3\n\nBody text");
    render(<TableOfContents headings={headings} />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("each entry is an <a> with href matching the heading slug", () => {
    const headings = extractHeadings("# Introduction\n\n## Setup Guide\n\n### Configuration\n\nBody");
    render(<TableOfContents headings={headings} />);

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(3);

    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("#introduction");
    expect(hrefs).toContain("#setup-guide");
    expect(hrefs).toContain("#configuration");
  });

  it("H1, H2, H3 entries are all present", () => {
    const headings = extractHeadings(
      "# Main Title\n\n## Section One\n\n### Sub Section\n\ntext"
    );
    render(<TableOfContents headings={headings} />);

    expect(screen.getByText("Main Title")).toBeInTheDocument();
    expect(screen.getByText("Section One")).toBeInTheDocument();
    expect(screen.getByText("Sub Section")).toBeInTheDocument();
  });

  it("link text matches heading text", () => {
    const headings = extractHeadings(
      "# Alpha\n\n## Beta\n\n### Gamma\n\nmore text"
    );
    render(<TableOfContents headings={headings} />);

    expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gamma" })).toBeInTheDocument();
  });
});
