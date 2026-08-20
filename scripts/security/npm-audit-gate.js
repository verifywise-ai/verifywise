#!/usr/bin/env node
/**
 * npm audit gate with documented no-fix exceptions.
 *
 * Runs `npm audit --json --omit=dev` in the directory given as argv[2]
 * (default: current working directory) and fails (exit 1) when any
 * high or critical vulnerability is found that is NOT listed in
 * scripts/security/audit-allowlist.json.
 *
 * Usage:
 *   node scripts/security/npm-audit-gate.js <dir>
 *
 * The allowlist is keyed by GitHub Security Advisory ID (GHSA-....)
 * extracted from the advisory URL in the audit report. Every entry
 * must carry a justification.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FAIL_SEVERITIES = new Set(["high", "critical"]);

function loadAllowlist() {
  const allowlistPath = path.join(__dirname, "audit-allowlist.json");
  const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
  const entries = raw.allowlist || [];
  for (const entry of entries) {
    if (!entry.id || !entry.justification) {
      console.error(
        `Invalid allowlist entry (id and justification are required): ${JSON.stringify(entry)}`,
      );
      process.exit(2);
    }
  }
  return new Map(entries.map((e) => [e.id, e.justification]));
}

function ghsaFromUrl(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Collect { ghsa, title, severity, packageName } for every advisory
 * reachable through the "via" graph of a vulnerability entry.
 * "via" entries are either strings (references to other packages)
 * or advisory objects.
 */
function collectAdvisories(vulnerabilities) {
  const advisories = [];
  for (const [packageName, vuln] of Object.entries(vulnerabilities)) {
    if (!FAIL_SEVERITIES.has(vuln.severity)) continue;
    for (const via of vuln.via || []) {
      if (typeof via === "string") continue; // transitive reference, reported at its own entry
      const ghsa = ghsaFromUrl(via.url);
      advisories.push({
        ghsa: ghsa || `no-ghsa:${via.source || via.title || "unknown"}`,
        title: via.title || "unknown advisory",
        severity: via.severity || vuln.severity,
        packageName: via.name || packageName,
        url: via.url || "",
      });
    }
  }
  return advisories;
}

function main() {
  const dir = path.resolve(process.argv[2] || ".");
  const allowlist = loadAllowlist();

  let auditJson;
  try {
    const out = execFileSync(
      "npm",
      ["audit", "--json", "--omit=dev"],
      {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
        // Windows cannot spawn npm.cmd directly without a shell.
        shell: process.platform === "win32",
      },
    );
    auditJson = out;
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities are found; stdout still holds the report.
    if (err.stdout) {
      auditJson = err.stdout;
    } else {
      console.error(`Failed to run npm audit in ${dir}: ${err.message}`);
      process.exit(2);
    }
  }

  let report;
  try {
    report = JSON.parse(auditJson);
  } catch (err) {
    console.error(`Could not parse npm audit JSON output: ${err.message}`);
    process.exit(2);
  }

  const advisories = collectAdvisories(report.vulnerabilities || {});

  const failing = [];
  const waived = [];
  for (const adv of advisories) {
    const justification = allowlist.get(adv.ghsa);
    if (justification) {
      waived.push({ ...adv, justification });
    } else {
      failing.push(adv);
    }
  }

  for (const adv of waived) {
    console.log(
      `WAIVED ${adv.severity.toUpperCase()} ${adv.packageName} (${adv.ghsa}): ${adv.title}\n  justification: ${adv.justification}`,
    );
  }

  if (failing.length > 0) {
    console.error(`\nDependency audit gate FAILED: ${failing.length} high/critical advisory(ies) without an approved exception:`);
    for (const adv of failing) {
      console.error(
        `  ${adv.severity.toUpperCase()} ${adv.packageName} (${adv.ghsa}): ${adv.title} ${adv.url}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Dependency audit gate passed (${waived.length} advisory(ies) waived via allowlist).`,
  );
}

main();
