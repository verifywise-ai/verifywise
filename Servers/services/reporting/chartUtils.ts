/**
 * Chart Utilities for Report Generation
 * Generates SVG charts server-side for embedding in PDF/DOCX reports
 */

import {
  RiskDistributionData,
  ComplianceProgressData,
  AssessmentStatusData,
} from "../../domain.layer/interfaces/i.reportGeneration";

/**
 * Generate a horizontal bar chart SVG for risk distribution
 */
export function generateRiskDistributionChart(
  data: RiskDistributionData[],
  options: { width?: number; height?: number; title?: string } = {},
): string {
  const { width = 400, height = 200, title = "Risk Distribution" } = options;

  if (!data || data.length === 0) {
    return "";
  }

  const maxCount = Math.max(...data.map((d) => d.count));
  const barHeight = 28;
  const barGap = 8;
  const labelWidth = 80;
  const chartWidth = width - labelWidth - 60;
  const titleHeight = title ? 30 : 0;
  const chartHeight = data.length * (barHeight + barGap) + titleHeight;
  const actualHeight = Math.max(height, chartHeight + 20);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${actualHeight}" viewBox="0 0 ${width} ${actualHeight}">`;

  // Title
  if (title) {
    svg += `<text x="${width / 2}" y="20" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="600" fill="#1C2130">${title}</text>`;
  }

  // Bars
  data.forEach((item, index) => {
    const y = titleHeight + index * (barHeight + barGap) + 10;
    const barWidth = maxCount > 0 ? (item.count / maxCount) * chartWidth : 0;

    // Label
    svg += `<text x="${labelWidth - 8}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#667085">${item.level}</text>`;

    // Background bar
    svg += `<rect x="${labelWidth}" y="${y}" width="${chartWidth}" height="${barHeight}" rx="4" fill="#F2F4F7"/>`;

    // Value bar
    if (barWidth > 0) {
      svg += `<rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${item.color}"/>`;
    }

    // Count label
    svg += `<text x="${labelWidth + chartWidth + 8}" y="${y + barHeight / 2 + 4}" text-anchor="start" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="500" fill="#1C2130">${item.count}</text>`;
  });

  svg += "</svg>";
  return svg;
}

/**
 * Generate a donut/pie chart SVG for risk distribution
 */
export function generateRiskDonutChart(
  data: RiskDistributionData[],
  options: { size?: number; title?: string } = {},
): string {
  const { size = 200, title = "" } = options;

  if (!data || data.length === 0) {
    return "";
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return "";

  const centerX = size / 2;
  const centerY = size / 2 + (title ? 15 : 0);
  const outerRadius = (size - 40) / 2;
  const innerRadius = outerRadius * 0.6;
  const svgHeight = size + (title ? 30 : 0);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${svgHeight}" viewBox="0 0 ${size} ${svgHeight}">`;

  // Title
  if (title) {
    svg += `<text x="${size / 2}" y="20" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="600" fill="#1C2130">${title}</text>`;
  }

  // Draw donut segments
  let currentAngle = -90; // Start from top

  data.forEach((item) => {
    const sliceAngle = (item.count / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;

    // Convert to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // Calculate arc points
    const x1Outer = centerX + outerRadius * Math.cos(startRad);
    const y1Outer = centerY + outerRadius * Math.sin(startRad);
    const x2Outer = centerX + outerRadius * Math.cos(endRad);
    const y2Outer = centerY + outerRadius * Math.sin(endRad);
    const x1Inner = centerX + innerRadius * Math.cos(endRad);
    const y1Inner = centerY + innerRadius * Math.sin(endRad);
    const x2Inner = centerX + innerRadius * Math.cos(startRad);
    const y2Inner = centerY + innerRadius * Math.sin(startRad);

    const largeArc = sliceAngle > 180 ? 1 : 0;

    const pathData = [
      `M ${x1Outer} ${y1Outer}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
      `L ${x1Inner} ${y1Inner}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
      "Z",
    ].join(" ");

    svg += `<path d="${pathData}" fill="${item.color}"/>`;

    currentAngle = endAngle;
  });

  // Center text (total)
  svg += `<text x="${centerX}" y="${centerY - 5}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" fill="#1C2130">${total}</text>`;
  svg += `<text x="${centerX}" y="${centerY + 15}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" fill="#667085">Total Risks</text>`;

  svg += "</svg>";
  return svg;
}

/**
 * Generate a progress bar chart for compliance
 */
export function generateComplianceProgressChart(
  data: ComplianceProgressData[],
  options: { width?: number; title?: string } = {},
): string {
  const { width = 400, title = "Compliance Progress" } = options;

  if (!data || data.length === 0) {
    return "";
  }

  const barHeight = 20;
  const rowHeight = 50;
  const labelHeight = 18;
  const titleHeight = title ? 35 : 0;
  const height = data.length * rowHeight + titleHeight + 20;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  // Title
  if (title) {
    svg += `<text x="0" y="20" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="600" fill="#1C2130">${title}</text>`;
  }

  // Progress bars
  data.forEach((item, index) => {
    const y = titleHeight + index * rowHeight;
    const progressWidth = (item.percentage / 100) * (width - 60);
    const progressColor =
      item.percentage >= 80 ? "#027A48" : item.percentage >= 50 ? "#B54708" : "#B42318";

    // Category label
    svg += `<text x="0" y="${y + labelHeight}" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#1C2130">${item.category}</text>`;

    // Progress bar background
    svg += `<rect x="0" y="${y + labelHeight + 6}" width="${width - 60}" height="${barHeight}" rx="4" fill="#F2F4F7"/>`;

    // Progress bar fill
    if (progressWidth > 0) {
      svg += `<rect x="0" y="${y + labelHeight + 6}" width="${progressWidth}" height="${barHeight}" rx="4" fill="${progressColor}"/>`;
    }

    // Percentage label
    svg += `<text x="${width - 50}" y="${y + labelHeight + 20}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="500" fill="${progressColor}">${item.percentage}%</text>`;

    // Count label
    svg += `<text x="${width}" y="${y + labelHeight + 20}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="10" fill="#667085">${item.completed}/${item.total}</text>`;
  });

  svg += "</svg>";
  return svg;
}

/**
 * Generate a legend for risk levels
 */
export function generateRiskLegend(
  data: RiskDistributionData[],
  options: { width?: number; inline?: boolean } = {},
): string {
  const { width = 300, inline = true } = options;

  if (!data || data.length === 0) {
    return "";
  }

  if (inline) {
    const itemWidth = Math.floor(width / data.length);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" viewBox="0 0 ${width} 24">`;

    data.forEach((item, index) => {
      const x = index * itemWidth;
      svg += `<rect x="${x}" y="6" width="12" height="12" rx="2" fill="${item.color}"/>`;
      svg += `<text x="${x + 16}" y="16" font-family="Inter, system-ui, sans-serif" font-size="11" fill="#667085">${item.level} (${item.count})</text>`;
    });

    svg += "</svg>";
    return svg;
  }

  // Vertical layout
  const height = data.length * 24 + 10;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  data.forEach((item, index) => {
    const y = index * 24 + 5;
    svg += `<rect x="0" y="${y}" width="12" height="12" rx="2" fill="${item.color}"/>`;
    svg += `<text x="18" y="${y + 10}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="#667085">${item.level}: ${item.count}</text>`;
  });

  svg += "</svg>";
  return svg;
}

/**
 * Generate assessment status pie chart
 */
export function generateAssessmentStatusChart(
  data: AssessmentStatusData[],
  options: { size?: number; title?: string } = {},
): string {
  const { size = 200, title = "Assessment Status" } = options;

  if (!data || data.length === 0) {
    return "";
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return "";

  const centerX = size / 2;
  const centerY = size / 2 + (title ? 15 : 0);
  const outerRadius = (size - 40) / 2;
  const innerRadius = outerRadius * 0.6;
  const svgHeight = size + (title ? 30 : 0);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${svgHeight}" viewBox="0 0 ${size} ${svgHeight}">`;

  // Title
  if (title) {
    svg += `<text x="${size / 2}" y="20" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="600" fill="#1C2130">${title}</text>`;
  }

  // Draw pie segments
  let currentAngle = -90;

  data.forEach((item) => {
    const sliceAngle = (item.count / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1Outer = centerX + outerRadius * Math.cos(startRad);
    const y1Outer = centerY + outerRadius * Math.sin(startRad);
    const x2Outer = centerX + outerRadius * Math.cos(endRad);
    const y2Outer = centerY + outerRadius * Math.sin(endRad);
    const x1Inner = centerX + innerRadius * Math.cos(endRad);
    const y1Inner = centerY + innerRadius * Math.sin(endRad);
    const x2Inner = centerX + innerRadius * Math.cos(startRad);
    const y2Inner = centerY + innerRadius * Math.sin(startRad);

    const largeArc = sliceAngle > 180 ? 1 : 0;

    const pathData = [
      `M ${x1Outer} ${y1Outer}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
      `L ${x1Inner} ${y1Inner}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
      "Z",
    ].join(" ");

    svg += `<path d="${pathData}" fill="${item.color}"/>`;

    currentAngle = endAngle;
  });

  // Center percentage
  const answered = data.find((d) => d.status === "Answered")?.count || 0;
  const percentage = Math.round((answered / total) * 100);
  svg += `<text x="${centerX}" y="${centerY - 5}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" fill="#1C2130">${percentage}%</text>`;
  svg += `<text x="${centerX}" y="${centerY + 15}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" fill="#667085">Complete</text>`;

  svg += "</svg>";
  return svg;
}

/**
 * Generate assessment status legend
 */
export function generateAssessmentLegend(
  data: AssessmentStatusData[],
  options: { width?: number } = {},
): string {
  const { width = 300 } = options;

  if (!data || data.length === 0) {
    return "";
  }

  const itemWidth = Math.floor(width / data.length);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" viewBox="0 0 ${width} 24">`;

  data.forEach((item, index) => {
    const x = index * itemWidth;
    svg += `<rect x="${x}" y="6" width="12" height="12" rx="2" fill="${item.color}"/>`;
    svg += `<text x="${x + 16}" y="16" font-family="Inter, system-ui, sans-serif" font-size="11" fill="#667085">${item.status} (${item.count})</text>`;
  });

  svg += "</svg>";
  return svg;
}
