import "@testing-library/jest-dom";
import { vi, beforeEach, afterEach, expect } from "vitest";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
  consoleWarnSpy = vi.spyOn(console, "warn");
});

afterEach(() => {
  expect(consoleErrorSpy, "Unexpected console.error call").not.toHaveBeenCalled();
  expect(consoleWarnSpy, "Unexpected console.warn call").not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
