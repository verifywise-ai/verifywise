/**
 * API contract smoke gate for the top 10 most-used VerifyWise endpoints.
 *
 * Reads Servers/swagger.yaml, logs in as the configured E2E admin, then calls
 * each endpoint and validates:
 *
 *   1. The response status code matches the expected status.
 *   2. The response body is valid JSON when a schema is declared.
 *   3. The body matches the OpenAPI schema declared in swagger.yaml
 *      (schema mismatches are reported as drift warnings unless the gate is
 *      run with CONTRACT_STRICT=1).
 *
 * Environment variables:
 *   - API_BASE_URL          target backend (default: http://localhost:3000)
 *   - E2E_ADMIN_EMAIL       tenant admin email
 *   - E2E_ADMIN_PASSWORD    tenant admin password
 *   - CONTRACT_STRICT=1     fail the gate on schema drift as well as
 *                           structural failures
 *
 * Exit codes:
 *   0 - all top-10 endpoints returned the expected status and valid JSON;
 *       schema drift may have been reported as warnings
 *   1 - one or more endpoints failed structurally, or schema drift was
 *       treated as a failure because CONTRACT_STRICT was enabled
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import YAML from "yamljs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
// Use the E2E admin account seeded by global setup / seedE2EAdmin.ts.
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.E2E_EMAIL || "e2e-admin@verifywise.local";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.E2E_PASSWORD || "E2EAdmin#1";
const STRICT = process.env.CONTRACT_STRICT === "1" || process.env.CONTRACT_STRICT === "true";

const SWAGGER_PATH = path.resolve(__dirname, "../swagger.yaml");

interface EndpointCall {
  method: string;
  path: string;
  auth: boolean;
  body?: Record<string, unknown>;
  expectedStatus?: number;
}

// Top 10 most-used API endpoints in the VerifyWise critical journeys.
// These endpoints are exercised on nearly every page load and cover auth,
// users, projects, risks, tasks, governance, and notifications.
const TOP_ENDPOINTS: EndpointCall[] = [
  {
    method: "POST",
    path: "/users/login",
    auth: false,
    body: { email: EMAIL, password: PASSWORD },
    expectedStatus: 202,
  },
  { method: "GET", path: "/users", auth: true },
  { method: "GET", path: "/roles", auth: true },
  { method: "GET", path: "/projects", auth: true },
  { method: "GET", path: "/projectRisks", auth: true },
  { method: "GET", path: "/tasks", auth: true },
  { method: "GET", path: "/vendors", auth: true },
  { method: "GET", path: "/frameworks", auth: true },
  { method: "GET", path: "/dashboard", auth: true },
  { method: "GET", path: "/notifications/summary", auth: true },
];

async function request(
  method: string,
  route: string,
  token: string | null,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const url = `${BASE_URL}/api${route}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function getResponseSchema(
  swagger: any,
  route: string,
  method: string,
  status: string,
): any | null {
  const pathObj = swagger.paths?.[route];
  if (!pathObj) return null;
  const operation = pathObj[method.toLowerCase()];
  if (!operation) return null;
  const response = operation.responses?.[status];
  if (!response) return null;
  return response.content?.["application/json"]?.schema || null;
}

async function main(): Promise<number> {
  if (!fs.existsSync(SWAGGER_PATH)) {
    console.error(`swagger.yaml not found at ${SWAGGER_PATH}`);
    return 1;
  }

  const swagger = YAML.load(SWAGGER_PATH) as any;
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    coerceTypes: false,
  });
  addFormats(ajv);

  let token: string | null = null;
  let structuralFailures = 0;
  let schemaDrifts = 0;

  for (const endpoint of TOP_ENDPOINTS) {
    const { method, path: route, auth, body, expectedStatus = 200 } = endpoint;
    process.stdout.write(`${method} /api${route} ... `);

    try {
      const { status, data } = await request(method, route, auth ? token : null, body);

      if (status !== expectedStatus) {
        console.log(`FAIL (status ${status}, expected ${expectedStatus})`);
        console.log("   body:", JSON.stringify(data).slice(0, 400));
        structuralFailures++;
        continue;
      }

      const schema = getResponseSchema(swagger, route, method, String(status));
      if (!schema) {
        console.log(`OK (no schema to validate for ${status})`);
        continue;
      }

      // Attach shared components so $ref resolves against the swagger root.
      const validate = ajv.compile({
        ...schema,
        components: swagger.components,
      });

      const valid = validate(data);
      if (!valid) {
        if (STRICT) {
          console.log("FAIL schema validation");
          console.error(validate.errors);
          structuralFailures++;
        } else {
          console.log("OK (schema drift reported)");
          schemaDrifts++;
          console.error("   drift:", ajv.errorsText(validate.errors));
        }
      } else {
        console.log("OK");
      }

      // Capture the login token for subsequent authenticated calls.
      if (route === "/users/login" && typeof data === "object" && data !== null) {
        const d = data as any;
        const payload = d.data ?? d;
        token = payload?.token ?? payload?.authToken ?? d.token ?? null;
      }
    } catch (err) {
      console.log(`ERROR ${err instanceof Error ? err.message : String(err)}`);
      structuralFailures++;
    }
  }

  console.log("");
  if (schemaDrifts > 0) {
    console.log(
      `Schema drift detected on ${schemaDrifts} endpoint(s). ` +
        `Run with CONTRACT_STRICT=1 to treat drift as a failure.`,
    );
  }

  if (structuralFailures > 0) {
    console.error(
      `API contract smoke gate failed: ${structuralFailures} endpoint(s) failed structural checks.`,
    );
    return 1;
  }

  console.log("API contract smoke gate passed for all top-10 endpoints.");
  return 0;
}

main().then((code) => {
  process.exit(code);
});
