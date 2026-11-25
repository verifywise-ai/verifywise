jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));

import { buildFrameworkRequirementCharts } from "../pdfGenerator";
import { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";

const group = (title: string, useCase: string | undefined, done: number, total: number) => ({
  title,
  orderNo: 1,
  useCase,
  rollup: { total, done, overdue: 0, unassigned: 0, noEvidence: 0, statusBreakdown: {} },
  requirements: [],
});

const dataFor = (groups: ReturnType<typeof group>[]): ReportData =>
  ({
    sections: {
      frameworkRequirements: {
        frameworks: [{ frameworkId: 5, frameworkName: "HIPAA", rollup: {}, groups }],
      },
    },
  }) as unknown as ReportData;

const barCount = (svg: string) => (svg.match(/%<\/text>/g) ?? []).length;

describe("buildFrameworkRequirementCharts", () => {
  it("draws one bar per group title however many use cases are paired", () => {
    const groups = Array.from({ length: 20 }, (_, i) => [
      group("Administrative", `Use case ${i}`, 1, 2),
      group("Technical", `Use case ${i}`, 2, 4),
    ]).flat();
    const [svg] = buildFrameworkRequirementCharts(dataFor(groups));
    expect(barCount(svg)).toBe(2);
    expect(svg).toContain("Administrative");
    expect(svg).not.toContain("Use case 3");
  });

  it("pools done and total across use cases", () => {
    const [svg] = buildFrameworkRequirementCharts(
      dataFor([group("Technical", "A", 1, 4), group("Technical", "B", 3, 4)]),
    );
    expect(svg).toContain("4/8");
  });

  it("truncates long labels and escapes them", () => {
    const long = `${"x".repeat(80)} <b>`;
    const [svg] = buildFrameworkRequirementCharts(dataFor([group(long, undefined, 0, 1)]));
    expect(svg).toContain(`${"x".repeat(54)}…`);
    expect(svg).not.toContain("x".repeat(60));
    expect(svg).not.toContain("<b>");
  });
});
