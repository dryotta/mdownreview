import { describe, it, expect } from "vitest";
import { basename, dirname, extname } from "@/lib/path-utils";

describe("basename", () => {
  it("returns the last path segment for a Unix path", () => {
    expect(basename("/home/user/docs/file.md")).toBe("file.md");
  });

  it("returns the last path segment for a Windows path", () => {
    expect(basename("C:\\Users\\foo\\bar.md")).toBe("bar.md");
  });

  it("returns just the filename when there is no directory component", () => {
    expect(basename("file.md")).toBe("file.md");
  });

  it("returns empty string for an empty input", () => {
    expect(basename("")).toBe("");
  });

  it("returns empty string for a trailing-slash path", () => {
    expect(basename("/home/user/")).toBe("");
  });

  it("handles a file at the root", () => {
    expect(basename("/file.md")).toBe("file.md");
  });
});

describe("dirname", () => {
  it("returns the directory portion of a Unix path", () => {
    expect(dirname("/home/user/docs/file.md")).toBe("/home/user/docs");
  });

  it("returns the directory for a Windows path (after normalization)", () => {
    expect(dirname("C:/Users/foo/bar.md")).toBe("C:/Users/foo");
  });

  it("returns the full path unchanged when there is no parent slash", () => {
    expect(dirname("file.md")).toBe("file.md");
  });

  it("handles a single-segment absolute path", () => {
    // lastSlash is 0 (not > 0) so returns the full path
    expect(dirname("/file.md")).toBe("/file.md");
  });
});

describe("extname", () => {
  it("returns the extension including the dot", () => {
    expect(extname("file.md")).toBe(".md");
  });

  it("returns a lowercase extension", () => {
    expect(extname("IMAGE.PNG")).toBe(".png");
  });

  it("returns empty string when there is no extension", () => {
    expect(extname("Makefile")).toBe("");
  });

  it("returns empty string for hidden files (dot at index 0)", () => {
    expect(extname(".hidden")).toBe("");
  });

  it("returns only the last extension for double-extension filenames", () => {
    expect(extname("archive.tar.gz")).toBe(".gz");
  });

  it("returns the extension for a file inside a directory path", () => {
    expect(extname("/home/user/docs/readme.txt")).toBe(".txt");
  });
});
