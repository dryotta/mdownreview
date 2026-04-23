import { describe, it, expect, vi } from "vitest";
import {
  generateCommentId,
  SELECTED_TEXT_MAX_LENGTH,
  TEXT_MAX_LENGTH,
  truncateSelectedText,
  validateTargetingFields,
} from "@/lib/comment-utils";

describe("generateCommentId", () => {
  it("returns a valid UUIDv4 string", () => {
    const id = generateCommentId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("returns unique IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateCommentId()));
    expect(ids.size).toBe(100);
  });
});

describe("MRSF constants", () => {
  it("SELECTED_TEXT_MAX_LENGTH is 4096", () => {
    expect(SELECTED_TEXT_MAX_LENGTH).toBe(4096);
  });

  it("TEXT_MAX_LENGTH is 16384", () => {
    expect(TEXT_MAX_LENGTH).toBe(16384);
  });
});

describe("truncateSelectedText", () => {
  it("returns text unchanged when under limit", () => {
    expect(truncateSelectedText("short")).toBe("short");
  });

  it("truncates text exceeding 4096 characters", () => {
    const long = "x".repeat(5000);
    const result = truncateSelectedText(long);
    expect(result.length).toBe(4096);
  });

  it("returns empty string for empty input", () => {
    expect(truncateSelectedText("")).toBe("");
  });

  it("truncates emoji text consistently with Rust (Unicode scalar values)", () => {
    // "😀" is 1 Unicode scalar value but 2 UTF-16 code units
    const emoji = "😀".repeat(5000); // 5000 emoji = 10000 UTF-16 code units
    const result = truncateSelectedText(emoji);
    // Should truncate to 4096 Unicode scalar values (matching Rust's chars().count())
    // NOT 4096 UTF-16 code units (which would cut in the middle of an emoji)
    expect(Array.from(result).length).toBeLessThanOrEqual(4096);
    // Verify no broken surrogate pairs
    expect(result).not.toMatch(/[\uD800-\uDBFF]$/); // no trailing high surrogate
  });

  it("counts combining characters as separate code points like Rust", () => {
    // "é" as e + combining accent = 2 code points, 2 chars in Rust
    const combining = "e\u0301".repeat(3000); // 3000 * 2 = 6000 code points
    const result = truncateSelectedText(combining);
    expect(Array.from(result).length).toBeLessThanOrEqual(4096);
  });

  it("handles mixed ASCII and emoji correctly", () => {
    // Build string: 4000 ASCII + 200 emoji = 4200 code points
    const mixed = "a".repeat(4000) + "😀".repeat(200);
    const result = truncateSelectedText(mixed);
    const codePoints = Array.from(result);
    expect(codePoints.length).toBe(4096);
    // The result should be 4000 'a' + 96 emoji
    expect(result.startsWith("a".repeat(4000))).toBe(true);
  });
});

describe("validateTargetingFields", () => {
  it("clamps end_line to be >= line", () => {
    const result = validateTargetingFields({ line: 10, end_line: 5 });
    expect(result.end_line).toBe(10);
  });

  it("clamps end_column to be >= start_column on same line", () => {
    const result = validateTargetingFields({
      line: 10,
      end_line: 10,
      start_column: 20,
      end_column: 5,
    });
    expect(result.end_column).toBe(20);
  });

  it("allows end_column < start_column on different lines", () => {
    const result = validateTargetingFields({
      line: 10,
      end_line: 12,
      start_column: 20,
      end_column: 5,
    });
    expect(result.end_column).toBe(5);
  });

  it("passes through valid fields unchanged", () => {
    const fields = { line: 5, end_line: 10, start_column: 0, end_column: 30 };
    expect(validateTargetingFields(fields)).toEqual(fields);
  });

  it("handles partial fields (line only)", () => {
    const result = validateTargetingFields({ line: 5 });
    expect(result).toEqual({ line: 5 });
  });

  it("logs warning when clamping", () => {
    const logger = { warn: vi.fn() };
    validateTargetingFields({ line: 10, end_line: 5 }, logger);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("clamped end_line"));
  });
});
