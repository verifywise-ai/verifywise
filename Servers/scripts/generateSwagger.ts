/**
 * Swagger/OpenAPI Generator
 *
 * Reads all registered route files, extracts endpoints, and generates an OpenAPI 3.0 YAML spec.
 * Run: npm run generate:swagger  (or: npx ts-node scripts/generateSwagger.ts)
 *
 * What it does:
 * 1. Parses app.ts to get the base path -> route file mapping.
 * 2. Reads each route file to extract method, path, middleware, and handler name.
 * 3. Infers bearerAuth security for routes protected by authenticateJWT / superAdminOnly.
 * 4. Merges the discovered endpoints into the existing swagger.yaml, preserving rich
 *    metadata (descriptions, request/response schemas, examples) for operations that
 *    already exist.
 * 5. Outputs the merged spec to Servers/swagger.yaml.
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yamljs";

const SERVERS_DIR = path.resolve(__dirname, "..");
const APP_FILE = path.join(SERVERS_DIR, "app.ts");
const ROUTES_DIR = path.join(SERVERS_DIR, "routes");
const SWAGGER_FILE = path.join(SERVERS_DIR, "swagger.yaml");

interface RawEndpoint {
  method: string;
  routePath: string;
  handlerName: string;
  auth: boolean;
  roles: string[];
}

export interface Endpoint extends RawEndpoint {
  path: string;
  openApiPath: string;
  tag: string;
  basePath: string;
  routeFile: string;
}

interface RouteRegistration {
  basePath: string;
  importName: string;
  isFactory: boolean;
  line: number;
}

// ---------------------------------------------------------------------------
// Parse app.ts for route registrations
// ---------------------------------------------------------------------------
export function parseAppFile(): RouteRegistration[] {
  const content = fs.readFileSync(APP_FILE, "utf-8");
  const lines = content.split("\n");
  const registrations: RouteRegistration[] = [];

  // Matches:
  //   app.use("/api/users", userRoutes);
  //   app.use("/api/deepeval", deepEvalRoutes());
  //   app.use("/api/automations", automation);
  const useRegex = /app\.use\s*\(\s*"([^"]+)"\s*,\s*(\w+)(?:\s*\(\s*\))?\s*\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;
    while ((match = useRegex.exec(line)) !== null) {
      registrations.push({
        basePath: match[1],
        importName: match[2],
        isFactory: line.includes(`${match[2]}()`),
        line: i + 1,
      });
    }
  }

  // Inline health endpoint
  if (content.includes('app.get("/health"')) {
    registrations.push({
      basePath: "/health",
      importName: "_inline_health",
      isFactory: false,
      line: 0,
    });
  }

  return registrations;
}

// ---------------------------------------------------------------------------
// Find the route file that corresponds to an import name in app.ts
// ---------------------------------------------------------------------------
export function findRouteFile(importName: string): string | null {
  const content = fs.readFileSync(APP_FILE, "utf-8");
  const importPathRegex = /from\s+"\.\/routes\/([^"]+)";/g;

  const allImportLines = content
    .split("\n")
    .filter((line) => line.includes("import") && line.includes("./routes/"));

  for (const line of allImportLines) {
    if (line.includes(importName)) {
      let fileRef: string | undefined;
      let match: RegExpExecArray | null;
      while ((match = importPathRegex.exec(line)) !== null) {
        fileRef = match[1];
      }
      if (!fileRef) continue;
      if (fileRef.endsWith(".js")) fileRef = fileRef.slice(0, -3);
      const candidate = path.join(ROUTES_DIR, fileRef + ".ts");
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // Fallback: match import name against route file names
  const possibleFiles = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".route.ts"));
  const normalizedImport = importName.toLowerCase().replace("routes", "");

  for (const f of possibleFiles) {
    const baseName = f.replace(".route.ts", "").toLowerCase();
    if (normalizedImport.includes(baseName) || baseName.includes(normalizedImport)) {
      return path.join(ROUTES_DIR, f);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Remove single-line comments from route file content
// ---------------------------------------------------------------------------
function removeComments(content: string): string {
  // Naive but sufficient for route files: strip // comments unless preceded by :
  return content.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// Parse a route file for endpoints
// ---------------------------------------------------------------------------
export function parseRouteFile(filePath: string): RawEndpoint[] {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  const content = removeComments(rawContent);
  const endpoints: RawEndpoint[] = [];

  // Detect router-level auth middleware
  let routerAuth = false;
  let routerRoles: string[] = [];
  const routerUseRegex = /router\.use\s*\(\s*([^)]+)\s*\)/g;
  let useMatch: RegExpExecArray | null;

  while ((useMatch = routerUseRegex.exec(content)) !== null) {
    const args = useMatch[1];
    if (args.includes("authenticateJWT") || args.includes("superAdminOnly")) {
      routerAuth = true;
    }
    const authRoles = extractRoles(args);
    for (const r of authRoles) {
      if (!routerRoles.includes(r)) routerRoles.push(r);
    }
  }

  const routeCallRegex = /router\.(get|post|put|patch|delete)\s*\(/g;
  let routeMatch: RegExpExecArray | null;

  while ((routeMatch = routeCallRegex.exec(content)) !== null) {
    const method = routeMatch[1];
    const startIdx = routeMatch.index + routeMatch[0].length;

    // Balance parentheses to find the matching closing )
    let depth = 1;
    let endIdx = startIdx;
    while (endIdx < content.length && depth > 0) {
      if (content[endIdx] === "(") depth++;
      if (content[endIdx] === ")") depth--;
      endIdx++;
    }

    const innerContent = content.substring(startIdx, endIdx - 1).trim();
    const pathMatch = innerContent.match(/^"([^"]*)"/);
    if (!pathMatch) continue;

    const routePath = pathMatch[1];
    const argsStr = innerContent.substring(pathMatch[0].length);

    const args = splitArgs(argsStr);
    const middlewarePatterns = [
      "authenticateJWT",
      "superAdminOnly",
      "authorize",
      "multer",
      "upload.",
      "express",
      "jsonParser",
      "rawParser",
      "proxy",
      "validateId",
      "validateVisibility",
      "validate",
      "limiter",
      "checkCache",
      "cacheResponse",
    ];

    let auth = routerAuth;
    let handlerName = "unknown";
    const roles = [...routerRoles];

    for (let i = args.length - 1; i >= 0; i--) {
      const arg = args[i];
      const isMiddleware = middlewarePatterns.some((mw) => arg.includes(mw));

      if (isMiddleware) {
        if (arg.includes("authenticateJWT") || arg.includes("superAdminOnly")) {
          auth = true;
        }
        const argRoles = extractRoles(arg);
        for (const r of argRoles) {
          if (!roles.includes(r)) roles.push(r);
        }
      } else if (handlerName === "unknown") {
        if (/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*$/.test(arg)) {
          handlerName = arg;
        } else if (arg.includes("=>") || arg.includes("function")) {
          handlerName = "anonymous";
        }
      }
    }

    endpoints.push({ method, routePath, handlerName, auth, roles });
  }

  return endpoints;
}

function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of argsStr) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) args.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }

  const lastTrimmed = current.trim();
  if (lastTrimmed) args.push(lastTrimmed);

  return args;
}

function extractRoles(args: string): string[] {
  const roles: string[] = [];
  const rolesMatch = args.match(/authorize\(\[([^\]]+)\]\)/);
  if (rolesMatch) {
    rolesMatch[1]
      .split(",")
      .map((r) => r.trim().replace(/"/g, ""))
      .forEach((r) => {
        if (r && !roles.includes(r)) roles.push(r);
      });
  }
  if (args.includes("superAdminOnly") && !roles.includes("Super Admin")) {
    roles.push("Super Admin");
  }
  return roles;
}

// ---------------------------------------------------------------------------
// Build full endpoint inventory
// ---------------------------------------------------------------------------
export function buildEndpoints(): Endpoint[] {
  const registrations = parseAppFile();
  const endpoints: Endpoint[] = [];

  for (const reg of registrations) {
    if (reg.importName === "_inline_health") {
      endpoints.push({
        method: "get",
        routePath: "/",
        handlerName: "healthCheck",
        auth: false,
        roles: [],
        path: "/health",
        openApiPath: "/health",
        tag: "System",
        basePath: "/health",
        routeFile: "app.ts",
      });
      continue;
    }

    const routeFilePath = findRouteFile(reg.importName);
    if (!routeFilePath || !fs.existsSync(routeFilePath)) {
      console.warn(`  Could not find route file for: ${reg.basePath} (${reg.importName})`);
      continue;
    }

    const rawEndpoints = parseRouteFile(routeFilePath);
    const tag = deriveTag(reg.basePath);

    for (const ep of rawEndpoints) {
      const fullPath = reg.basePath + ep.routePath;
      const openApiPath = expressPathToOpenApiPath(fullPath);

      endpoints.push({
        method: ep.method,
        routePath: ep.routePath,
        handlerName: ep.handlerName,
        auth: ep.auth,
        roles: ep.roles,
        path: fullPath,
        openApiPath,
        tag,
        basePath: reg.basePath,
        routeFile: path.basename(routeFilePath),
      });
    }
  }

  return endpoints;
}

export function expressPathToOpenApiPath(expressPath: string): string {
  let p = expressPath.replace(/^\/api/, "").replace(/\/:(\w+)/g, "/{$1}");

  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }

  return p || "/";
}

export function deriveTag(basePath: string): string {
  const tagMap: Record<string, string> = {
    "/api/users": "Users",
    "/api/projects": "Projects",
    "/api/projectRisks": "Project Risks",
    "/api/vendorRisks": "Vendor Risks",
    "/api/vendors": "Vendors",
    "/api/modelRisks": "Model Risks",
    "/api/modelInventory": "Model Inventory",
    "/api/modelInventoryHistory": "Model Inventory",
    "/api/datasets": "Datasets",
    "/api/dataset-bulk-upload": "Datasets",
    "/api/dataset-change-history": "Datasets",
    "/api/policies": "Policies",
    "/api/tasks": "Tasks",
    "/api/training": "Training",
    "/api/organizations": "Organizations",
    "/api/roles": "Roles",
    "/api/files": "Files",
    "/api/file-manager": "Files",
    "/api/virtual-folders": "Files",
    "/api/mail": "Mail",
    "/api/invitations": "Invitations",
    "/api/frameworks": "Frameworks",
    "/api/eu-ai-act": "EU AI Act",
    "/api/iso-42001": "ISO 42001",
    "/api/iso-27001": "ISO 27001",
    "/api/nist-ai-rmf": "NIST AI RMF",
    "/api/compliance": "Compliance",
    "/api/fria": "FRIA",
    "/api/ce-marking": "CE Marking",
    "/api/pmm": "Post-Market Monitoring",
    "/api/ai-gateway": "AI Gateway",
    "/api/ai-detection": "AI Detection",
    "/api/ai-detection/repositories": "AI Detection",
    "/api/shadow-ai": "Shadow AI",
    "/api/v1/shadow-ai": "Shadow AI",
    "/api/ai-incident-managements": "Incidents",
    "/api/approval-workflows": "Approval Workflows",
    "/api/approval-requests": "Approval Workflows",
    "/api/automations": "Automations",
    "/api/plugins": "Plugins",
    "/api/notifications": "Notifications",
    "/api/entity-graph": "Entity Graph",
    "/api/evidenceHub": "Evidence",
    "/api/search": "Search",
    "/api/notes": "Notes",
    "/api/shares": "Share Links",
    "/api/agent-primitives": "Agent Discovery",
    "/api/aiTrustCentre": "AI Trust Centre",
    "/api/super-admin": "Super Admin",
    "/api/internal": "Internal",
    "/api/audit-ledger": "Audit",
    "/api/feature-settings": "Settings",
    "/api/logger": "System",
    "/api/reporting": "Reporting",
    "/api/dashboard": "Dashboard",
    "/api/autoDrivers": "Demo Data",
    "/api/assessments": "Assessments",
    "/api/questions": "Assessments",
    "/api/webhooks": "Webhooks",
    "/api/slackWebhooks": "Integrations",
    "/api/integrations/github": "Integrations",
    "/api/tokens": "Authentication",
    "/api/llm-keys": "LLM Keys",
    "/api/evaluation-llm-keys": "LLM Evals",
    "/api/deepeval": "LLM Evals",
    "/api/tiers": "Subscriptions",
    "/api/subscriptions": "Subscriptions",
    "/api/user-preferences": "Users",
    "/api/advisor": "AI Advisor",
    "/api/intake": "Intake Forms",
    "/api/version": "System",
    "/api/policy-linked": "Policies",
    "/api/quantitative-risks": "Quantitative Risks",
    "/api/risk-benchmarks": "Risk Benchmarks",
    "/api/riskHistory": "Risk History",
    "/api/readiness": "Readiness",
    "/api/ssoConfig": "SSO Config",
    "/api/ai-approvals": "AI Approvals",
    "/api/ai-approval-rules": "AI Approval Rules",
    "/api/ai-apps": "AI Apps",
    "/api/ai-audit": "AI Audit",
    "/api/ai-content": "AI Content",
    "/api/ai-confirmation": "AI Confirmation",
    "/api/custom-fields": "Custom Fields",
    "/api/evidence-ai": "Evidence AI",
    "/api/governance-os": "Governance OS",
  };

  if (basePath.includes("change-history")) {
    return "Change History";
  }

  return (
    tagMap[basePath] ||
    basePath
      .replace("/api/", "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function humanizeHandlerName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ---------------------------------------------------------------------------
// Merge discovered endpoints into existing swagger.yaml
// ---------------------------------------------------------------------------
export function mergeSwagger(endpoints: Endpoint[], existing: any): any {
  const doc = JSON.parse(JSON.stringify(existing));

  // Ensure top-level structure
  doc.openapi = doc.openapi || "3.0.0";
  doc.info = doc.info || { title: "VerifyWise API", version: "2.0.0" };
  doc.paths = doc.paths || {};
  doc.components = doc.components || {};
  doc.components.securitySchemes = doc.components.securitySchemes || {
    bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  };

  const existingPaths = doc.paths;
  const newPaths: Record<string, Record<string, any>> = {};
  const usedOperationIds = new Set<string>();
  const allTags = new Set<string>();

  for (const ep of endpoints) {
    const method = ep.method.toLowerCase();
    const openApiPath = ep.openApiPath;

    if (!newPaths[openApiPath]) {
      newPaths[openApiPath] = {};
    }

    const existingOp = existingPaths[openApiPath]?.[method];
    let operation: any;

    if (existingOp) {
      // Preserve existing metadata but refresh tags, operationId, and security
      operation = JSON.parse(JSON.stringify(existingOp));
    } else {
      // Create a minimal operation
      operation = {
        summary: humanizeHandlerName(ep.handlerName),
        responses: {
          "200": { description: "Success" },
          "500": { description: "Internal server error" },
        },
      };
    }

    operation.tags = [ep.tag];

    // Unique operationId
    let operationId = ep.handlerName;
    if (usedOperationIds.has(operationId)) {
      const prefix = ep.basePath.replace("/api/", "").replace(/[^a-zA-Z0-9]/g, "_");
      operationId = `${prefix}_${ep.handlerName}`;
    }
    operation.operationId = operationId;
    usedOperationIds.add(operationId);

    if (ep.auth) {
      operation.security = [{ bearerAuth: [] }];
    } else {
      delete operation.security;
    }

    if (ep.roles.length > 0) {
      operation.description = `Requires role: ${ep.roles.join(" or ")}`;
    }

    allTags.add(ep.tag);

    newPaths[openApiPath][method] = operation;
  }

  // Preserve shared path-level parameters if any
  for (const [p, methods] of Object.entries(existingPaths)) {
    if (newPaths[p] && (methods as any).parameters) {
      newPaths[p].parameters = (methods as any).parameters;
    }
  }

  doc.paths = newPaths;

  // Update tags list
  doc.tags = [...allTags].sort().map((name) => ({ name }));

  return doc;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
if (require.main === module) {
  main();
}

function main() {
  console.log("Parsing app.ts for route mappings...");
  const endpoints = buildEndpoints();
  console.log(`Found ${endpoints.length} endpoints`);

  const methods = ["get", "post", "put", "patch", "delete"];
  for (const m of methods) {
    const count = endpoints.filter((e) => e.method === m).length;
    console.log(`  ${m.toUpperCase()}: ${count}`);
  }

  const unresolved = endpoints.filter((e) => e.handlerName === "unknown");
  if (unresolved.length > 0) {
    console.warn(`\nWarning: ${unresolved.length} endpoints with unresolved handlers:`);
    unresolved.forEach((e) => console.warn(`  ${e.method.toUpperCase()} ${e.path}`));
  }

  console.log("\nLoading existing swagger.yaml...");
  let existing: any;
  if (fs.existsSync(SWAGGER_FILE)) {
    existing = YAML.load(SWAGGER_FILE);
  } else {
    existing = {};
  }

  console.log("Merging endpoints into OpenAPI spec...");
  const merged = mergeSwagger(endpoints, existing);

  console.log("Writing swagger.yaml...");
  fs.writeFileSync(SWAGGER_FILE, YAML.stringify(merged, 10, 2), "utf-8");
  console.log(`Written to ${SWAGGER_FILE}`);

  const pathCount = Object.keys(merged.paths).length;
  let opCount = 0;
  for (const methods of Object.values(merged.paths)) {
    opCount += Object.keys(methods as any).length;
  }
  console.log(`Total paths: ${pathCount}, operations: ${opCount}`);
}
