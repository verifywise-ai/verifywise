const fs = require("fs");
const path = require("path");

const auditPath = path.join(__dirname, "auditTenantIsolationCoverage.ts");
let content = fs.readFileSync(auditPath, "utf8");

const newEntries = fs
  .readFileSync(path.join(__dirname, "deferred-tables-entries.txt"), "utf8")
  .trim();

// Replace the body of the deferredScopedTables array
content = content.replace(
  /(const deferredScopedTables: SharedTableEntry\[\] = \[)[\s\S]*?(\n\];\n\nfunction isDeferredScopedTable)/,
  `$1\n${newEntries}$2`,
);

fs.writeFileSync(auditPath, content);
console.log("Replaced deferred tables list");
