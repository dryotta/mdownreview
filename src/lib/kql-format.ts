import type { KqlPipelineStep } from "@/lib/tauri-commands";

/**
 * Format a parsed KQL pipeline back into a multi-line query string for display.
 *
 * Pure view-layer concern derived from the steps returned by the Rust parser.
 * The first step is rendered bare (it's the source table); every subsequent
 * step is prefixed with `\n| ` and an optional details suffix.
 *
 * Returns an empty string for an empty step list.
 */
export function formatStepsForDisplay(steps: KqlPipelineStep[]): string {
  if (steps.length === 0) return "";
  const first = steps[0].operator;
  const rest = steps.slice(1).map((s) => {
    const detail = s.details ? ` ${s.details}` : "";
    return `\n| ${s.operator}${detail}`;
  });
  return first + rest.join("");
}
