import { describe, it, expect } from "vitest";
import { renderReport } from "./report";
import { Finding } from "./types";

describe("report", () => {
  it("groups findings by category with a summary count", () => {
    const findings: Finding[] = [
      { category: "contract", severity: "high", title: "A", expected: "x", actual: "y", repro: "z" },
      { category: "workflow", severity: "medium", title: "B", expected: "x", actual: "y", repro: "z" },
    ];
    const md = renderReport(findings);
    expect(md).toContain("# MRM simulator — gap report");
    expect(md).toContain("2 findings");
    expect(md).toContain("## Contract");
    expect(md).toContain("## Workflow");
    expect(md).toContain("A");
  });

  it("renders a clean bill of health when there are no findings", () => {
    const md = renderReport([]);
    expect(md).toContain("No gaps found");
  });
});
