import { describe, it, expect } from "vitest";
import { formatStepsForDisplay } from "@/lib/kql-format";
import type { KqlPipelineStep } from "@/lib/tauri-commands";

const step = (
  partial: Partial<KqlPipelineStep> & { step: number; operator: string }
): KqlPipelineStep => ({
  details: "",
  isSource: false,
  ...partial,
});

describe("formatStepsForDisplay", () => {
  it("returns an empty string for an empty steps array", () => {
    expect(formatStepsForDisplay([])).toBe("");
  });

  it("renders a single source step as just the operator name (no pipe)", () => {
    const steps: KqlPipelineStep[] = [
      step({ step: 1, operator: "MyTable", isSource: true }),
    ];
    expect(formatStepsForDisplay(steps)).toBe("MyTable");
  });

  it("joins multiple steps with `\\n| ` and includes details when present", () => {
    const steps: KqlPipelineStep[] = [
      step({ step: 1, operator: "MyTable", isSource: true }),
      step({ step: 2, operator: "where", details: "x > 1" }),
      step({ step: 3, operator: "project", details: "x, y" }),
    ];
    expect(formatStepsForDisplay(steps)).toBe(
      "MyTable\n| where x > 1\n| project x, y"
    );
  });

  it("omits the leading space when a non-source step has no details", () => {
    const steps: KqlPipelineStep[] = [
      step({ step: 1, operator: "MyTable", isSource: true }),
      step({ step: 2, operator: "count", details: "" }),
    ];
    expect(formatStepsForDisplay(steps)).toBe("MyTable\n| count");
  });
});
