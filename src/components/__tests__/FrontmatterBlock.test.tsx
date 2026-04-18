import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FrontmatterBlock } from "../viewers/FrontmatterBlock";

// ─── 10.6: FrontmatterBlock behavior ─────────────────────────────────────────

describe("10.6 – FrontmatterBlock", () => {
  const data = {
    title: "My Document",
    author: "Alice",
    date: "2024-01-01",
  };

  it("is expanded by default and shows key-value pairs", () => {
    render(<FrontmatterBlock data={data} />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("My Document")).toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("date")).toBeInTheDocument();
    expect(screen.getByText("2024-01-01")).toBeInTheDocument();
  });

  it("clicking the header collapses the body", () => {
    render(<FrontmatterBlock data={data} />);

    const header = screen.getByRole("button");
    fireEvent.click(header);

    expect(screen.queryByText("title")).not.toBeInTheDocument();
    expect(screen.queryByText("My Document")).not.toBeInTheDocument();
  });

  it("clicking again re-expands", () => {
    render(<FrontmatterBlock data={data} />);

    const header = screen.getByRole("button");
    fireEvent.click(header); // collapse
    fireEvent.click(header); // expand

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("My Document")).toBeInTheDocument();
  });

  it("aria-expanded reflects collapsed state", () => {
    render(<FrontmatterBlock data={data} />);

    const header = screen.getByRole("button");
    expect(header).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
  });
});
