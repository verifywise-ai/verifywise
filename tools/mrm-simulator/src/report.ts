import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Finding } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(HERE, "..", "gaps-report.md");

const CATEGORIES: Finding["category"][] = ["contract", "workflow", "ux"];
const title = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

export const renderReport = (findings: Finding[]): string => {
  const lines: string[] = ["# MRM simulator — gap report", ""];
  lines.push(`${findings.length} findings.`, "");
  if (findings.length === 0) {
    lines.push("No gaps found. The MRM governance loop behaved as documented.");
    return lines.join("\n");
  }
  for (const cat of CATEGORIES) {
    const group = findings.filter((f) => f.category === cat);
    if (group.length === 0) continue;
    lines.push(`## ${title(cat)}`, "");
    for (const f of group) {
      lines.push(`### [${f.severity}] ${f.title}`);
      lines.push(`- **Expected:** ${f.expected}`);
      lines.push(`- **Actual:** ${f.actual}`);
      lines.push(`- **Repro:** ${f.repro}`);
      lines.push("");
    }
  }
  return lines.join("\n");
};

export const writeReport = (findings: Finding[]): void => {
  writeFileSync(REPORT_PATH, renderReport(findings));
};
