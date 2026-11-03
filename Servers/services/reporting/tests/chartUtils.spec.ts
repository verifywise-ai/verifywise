/**
 * Chart Utilities Unit Tests
 * Tests for server-side SVG chart generation
 */

import {
  generateRiskDistributionChart,
  generateRiskDonutChart,
  generateComplianceProgressChart,
  generateRiskLegend,
  generateAssessmentStatusChart,
  generateAssessmentLegend,
} from "../chartUtils";
import {
  RiskDistributionData,
  ComplianceProgressData,
  AssessmentStatusData,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import { status } from "../../../tools/design-tokens/palette";

describe("chartUtils", () => {
  describe("generateRiskDistributionChart", () => {
    const mockRiskData: RiskDistributionData[] = [
      { level: "Critical", count: 5, color: "#B42318" },
      { level: "High", count: 10, color: "#C4320A" },
      { level: "Medium", count: 15, color: "#B54708" },
      { level: "Low", count: 20, color: "#027A48" },
    ];

    it("should return empty string for empty data", () => {
      expect(generateRiskDistributionChart([])).toBe("");
    });

    it("should return empty string for null/undefined data", () => {
      expect(generateRiskDistributionChart(null as any)).toBe("");
      expect(generateRiskDistributionChart(undefined as any)).toBe("");
    });

    it("should generate valid SVG with default options", () => {
      const svg = generateRiskDistributionChart(mockRiskData);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it("should include all risk levels in the chart", () => {
      const svg = generateRiskDistributionChart(mockRiskData);

      expect(svg).toContain("Critical");
      expect(svg).toContain("High");
      expect(svg).toContain("Medium");
      expect(svg).toContain("Low");
    });

    it("should include count values", () => {
      const svg = generateRiskDistributionChart(mockRiskData);

      expect(svg).toContain(">5<");
      expect(svg).toContain(">10<");
      expect(svg).toContain(">15<");
      expect(svg).toContain(">20<");
    });

    it("should apply custom width", () => {
      const svg = generateRiskDistributionChart(mockRiskData, { width: 500 });

      expect(svg).toContain('width="500"');
    });

    it("should include title when provided", () => {
      const svg = generateRiskDistributionChart(mockRiskData, {
        title: "Custom Title",
      });

      expect(svg).toContain("Custom Title");
    });

    it("should use correct colors from data", () => {
      const svg = generateRiskDistributionChart(mockRiskData);

      expect(svg).toContain("#B42318");
      expect(svg).toContain("#C4320A");
      expect(svg).toContain("#B54708");
      expect(svg).toContain("#027A48");
    });
  });

  describe("generateRiskDonutChart", () => {
    const mockRiskData: RiskDistributionData[] = [
      { level: "High", count: 10, color: "#C4320A" },
      { level: "Low", count: 5, color: "#027A48" },
    ];

    it("should return empty string for empty data", () => {
      expect(generateRiskDonutChart([])).toBe("");
    });

    it("should return empty string when total is zero", () => {
      const zeroData = [{ level: "High", count: 0, color: "#C4320A" }];
      expect(generateRiskDonutChart(zeroData)).toBe("");
    });

    it("should generate valid SVG", () => {
      const svg = generateRiskDonutChart(mockRiskData);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain("<path");
    });

    it("should display total count in center", () => {
      const svg = generateRiskDonutChart(mockRiskData);

      // Total is 15
      expect(svg).toContain(">15<");
      expect(svg).toContain("Total Risks");
    });

    it("should apply custom size", () => {
      const svg = generateRiskDonutChart(mockRiskData, { size: 250 });

      expect(svg).toContain('width="250"');
    });

    it("should include title when provided", () => {
      const svg = generateRiskDonutChart(mockRiskData, { title: "Risk Overview" });

      expect(svg).toContain("Risk Overview");
    });
  });

  describe("generateComplianceProgressChart", () => {
    const mockComplianceData: ComplianceProgressData[] = [
      { category: "Security", completed: 8, total: 10, percentage: 80 },
      { category: "Privacy", completed: 5, total: 10, percentage: 50 },
      { category: "Access Control", completed: 2, total: 10, percentage: 20 },
    ];

    it("should return empty string for empty data", () => {
      expect(generateComplianceProgressChart([])).toBe("");
    });

    it("should generate valid SVG", () => {
      const svg = generateComplianceProgressChart(mockComplianceData);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("should include category names", () => {
      const svg = generateComplianceProgressChart(mockComplianceData);

      expect(svg).toContain("Security");
      expect(svg).toContain("Privacy");
      expect(svg).toContain("Access Control");
    });

    it("should show percentages", () => {
      const svg = generateComplianceProgressChart(mockComplianceData);

      expect(svg).toContain("80%");
      expect(svg).toContain("50%");
      expect(svg).toContain("20%");
    });

    it("should show completion counts", () => {
      const svg = generateComplianceProgressChart(mockComplianceData);

      expect(svg).toContain("8/10");
      expect(svg).toContain("5/10");
      expect(svg).toContain("2/10");
    });

    it("should apply correct colors based on percentage", () => {
      const svg = generateComplianceProgressChart(mockComplianceData);

      // 80% is success, 50% is warning, 20% is error.
      expect(svg).toContain(status.success.text);
      expect(svg).toContain(status.warning.text);
      expect(svg).toContain(status.error.text);
    });

    it("should include title when provided", () => {
      const svg = generateComplianceProgressChart(mockComplianceData, {
        title: "Compliance Status",
      });

      expect(svg).toContain("Compliance Status");
    });
  });

  describe("generateRiskLegend", () => {
    const mockRiskData: RiskDistributionData[] = [
      { level: "High", count: 10, color: "#C4320A" },
      { level: "Low", count: 5, color: "#027A48" },
    ];

    it("should return empty string for empty data", () => {
      expect(generateRiskLegend([])).toBe("");
    });

    it("should generate inline legend by default", () => {
      const svg = generateRiskLegend(mockRiskData);

      expect(svg).toContain("<svg");
      expect(svg).toContain('height="24"');
    });

    it("should include risk levels with counts", () => {
      const svg = generateRiskLegend(mockRiskData);

      expect(svg).toContain("High (10)");
      expect(svg).toContain("Low (5)");
    });

    it("should use correct colors", () => {
      const svg = generateRiskLegend(mockRiskData);

      expect(svg).toContain("#C4320A");
      expect(svg).toContain("#027A48");
    });

    it("should generate vertical layout when inline is false", () => {
      const svg = generateRiskLegend(mockRiskData, { inline: false });

      // Vertical layout has different format
      expect(svg).toContain("High: 10");
      expect(svg).toContain("Low: 5");
    });
  });

  describe("generateAssessmentStatusChart", () => {
    const mockAssessmentData: AssessmentStatusData[] = [
      { status: "Answered", count: 75, color: "#027A48" },
      { status: "Pending", count: 25, color: "#F2F4F7" },
    ];

    it("should return empty string for empty data", () => {
      expect(generateAssessmentStatusChart([])).toBe("");
    });

    it("should return empty string when total is zero", () => {
      const zeroData = [{ status: "Answered", count: 0, color: "#027A48" }];
      expect(generateAssessmentStatusChart(zeroData)).toBe("");
    });

    it("should generate valid SVG", () => {
      const svg = generateAssessmentStatusChart(mockAssessmentData);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain("<path");
    });

    it("should display completion percentage in center", () => {
      const svg = generateAssessmentStatusChart(mockAssessmentData);

      // 75 out of 100 = 75%
      expect(svg).toContain(">75%<");
      expect(svg).toContain("Complete");
    });

    it("should use correct colors", () => {
      const svg = generateAssessmentStatusChart(mockAssessmentData);

      expect(svg).toContain("#027A48");
      expect(svg).toContain("#F2F4F7");
    });

    it("should include title when provided", () => {
      const svg = generateAssessmentStatusChart(mockAssessmentData, {
        title: "Assessment Progress",
      });

      expect(svg).toContain("Assessment Progress");
    });
  });

  describe("generateAssessmentLegend", () => {
    const mockAssessmentData: AssessmentStatusData[] = [
      { status: "Answered", count: 75, color: "#027A48" },
      { status: "Pending", count: 25, color: "#F2F4F7" },
    ];

    it("should return empty string for empty data", () => {
      expect(generateAssessmentLegend([])).toBe("");
    });

    it("should generate valid SVG", () => {
      const svg = generateAssessmentLegend(mockAssessmentData);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("should include status labels with counts", () => {
      const svg = generateAssessmentLegend(mockAssessmentData);

      expect(svg).toContain("Answered (75)");
      expect(svg).toContain("Pending (25)");
    });

    it("should use correct colors", () => {
      const svg = generateAssessmentLegend(mockAssessmentData);

      expect(svg).toContain("#027A48");
      expect(svg).toContain("#F2F4F7");
    });
  });
});
