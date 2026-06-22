/**
 * API Documentation Drift Checker
 *
 * Compares the endpoints registered in the Express application with the
 * operations declared in swagger.yaml. Fails with a non-zero exit code when
 * drift is detected.
 *
 * Run: npm run check:api-drift
 */

import * as path from "path";
import YAML from "yamljs";
import { buildEndpoints } from "./generateSwagger";

const SWAGGER_FILE = path.resolve(__dirname, "..", "swagger.yaml");

const ALLOW_LIST: string[] = [
  // Health check is an inline route and is intentionally simple.
  "GET /health",
];

interface DriftIssue {
  type: "code-missing-in-swagger" | "swagger-missing-in-code" | "auth-mismatch";
  key: string;
  details?: string;
}

function loadSwaggerOperations(): Map<string, { hasAuth: boolean }> {
  const doc = YAML.load(SWAGGER_FILE) as any;
  const ops = new Map<string, { hasAuth: boolean }>();

  for (const [swaggerPath, methods] of Object.entries(doc.paths || {})) {
    for (const [method, op] of Object.entries(methods as any)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const key = `${method.toUpperCase()} ${swaggerPath}`;
      const security = (op as any).security;
      const hasAuth = Array.isArray(security) && security.some((s) => s.bearerAuth !== undefined);
      ops.set(key, { hasAuth });
    }
  }

  return ops;
}

function isAllowed(key: string): boolean {
  return ALLOW_LIST.includes(key);
}

function main(): void {
  console.log("Building Express endpoint inventory...");
  const expressEndpoints = buildEndpoints();

  console.log("Loading swagger.yaml operations...");
  const swaggerOps = loadSwaggerOperations();

  const issues: DriftIssue[] = [];
  const expressKeys = new Set<string>();
  const expressAuthKeys = new Set<string>();

  for (const ep of expressEndpoints) {
    const key = `${ep.method.toUpperCase()} ${ep.openApiPath}`;
    expressKeys.add(key);
    if (ep.auth) expressAuthKeys.add(key);

    if (isAllowed(key)) continue;

    const op = swaggerOps.get(key);
    if (!op) {
      issues.push({
        type: "code-missing-in-swagger",
        key,
        details: `${ep.path} (${ep.routeFile})`,
      });
    } else if (ep.auth && !op.hasAuth) {
      issues.push({
        type: "auth-mismatch",
        key,
        details: `Route uses JWT auth but swagger.yaml is missing bearerAuth (${ep.routeFile})`,
      });
    }
  }

  for (const key of swaggerOps.keys()) {
    if (isAllowed(key)) continue;
    if (!expressKeys.has(key)) {
      issues.push({
        type: "swagger-missing-in-code",
        key,
      });
    }
  }

  if (issues.length === 0) {
    console.log("\n✅ No API documentation drift detected.");
    console.log(`   Express endpoints: ${expressKeys.size}`);
    console.log(`   Swagger operations: ${swaggerOps.size}`);
    process.exit(0);
  }

  console.error("\n❌ API documentation drift detected:\n");

  const codeMissing = issues.filter((i) => i.type === "code-missing-in-swagger");
  const swaggerMissing = issues.filter((i) => i.type === "swagger-missing-in-code");
  const authMismatches = issues.filter((i) => i.type === "auth-mismatch");

  if (codeMissing.length > 0) {
    console.error(`Routes in code but missing from swagger.yaml (${codeMissing.length}):`);
    codeMissing.forEach((i) => console.error(`  ${i.key} — ${i.details}`));
    console.error("");
  }

  if (swaggerMissing.length > 0) {
    console.error(`Operations in swagger.yaml but missing from code (${swaggerMissing.length}):`);
    swaggerMissing.forEach((i) => console.error(`  ${i.key}`));
    console.error("");
  }

  if (authMismatches.length > 0) {
    console.error(`Auth mismatches (${authMismatches.length}):`);
    authMismatches.forEach((i) => console.error(`  ${i.key} — ${i.details}`));
    console.error("");
  }

  process.exit(1);
}

main();
