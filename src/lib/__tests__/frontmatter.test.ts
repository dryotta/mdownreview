import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "@/lib/frontmatter";

describe("parseFrontmatter", () => {
  it("parses a happy-path block with multiple keys and trims the body", () => {
    const input = "---\ntitle: Hello\nauthor: Alice\ndate: 2024-01-01\n---\n\nBody here\n";
    const { body, data } = parseFrontmatter(input);
    expect(data).toEqual({
      title: "Hello",
      author: "Alice",
      date: "2024-01-01",
    });
    expect(body).toBe("Body here\n");
  });

  it("returns the entire content as body when there is no leading ---", () => {
    const input = "no frontmatter here\n---\nstill body\n";
    const { body, data } = parseFrontmatter(input);
    expect(data).toBeNull();
    expect(body).toBe(input);
  });

  it("treats a missing closing --- as no frontmatter at all", () => {
    const input = "---\ntitle: Hello\nauthor: Alice\nbody never closed";
    const { body, data } = parseFrontmatter(input);
    expect(data).toBeNull();
    expect(body).toBe(input);
  });

  it("returns an empty body when frontmatter is followed by nothing", () => {
    const input = "---\ntitle: Hello\n---";
    const { body, data } = parseFrontmatter(input);
    expect(data).toEqual({ title: "Hello" });
    expect(body).toBe("");
  });

  it("silently skips lines without a colon inside the YAML block", () => {
    const input = "---\ntitle: Hello\nthis-line-has-no-colon\nauthor: Bob\n---\nBody\n";
    const { body, data } = parseFrontmatter(input);
    expect(data).toEqual({ title: "Hello", author: "Bob" });
    expect(body).toBe("Body\n");
  });

  it("preserves colons in the value (only the first colon is the separator)", () => {
    const input = "---\nurl: https://example.com:8080/path\ntime: 12:34:56\n---\nx";
    const { body, data } = parseFrontmatter(input);
    expect(data).toEqual({
      url: "https://example.com:8080/path",
      time: "12:34:56",
    });
    expect(body).toBe("x");
  });

  it("returns null data and the input as body when there is no frontmatter at all", () => {
    const input = "# Just a heading\n\nSome paragraph.\n";
    const { body, data } = parseFrontmatter(input);
    expect(data).toBeNull();
    expect(body).toBe(input);
  });

  it("drops empty keys (e.g. lines starting with a colon)", () => {
    const input = "---\n: orphan\nkey: value\n---\nBody";
    const { body, data } = parseFrontmatter(input);
    expect(data).toEqual({ key: "value" });
    expect(body).toBe("Body");
  });
});
