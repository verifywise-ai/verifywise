/**
 * Live-response OpenAPI contract tests — issue #4502.
 *
 * Seeds the integration database, calls ten high-traffic routes through the
 * real Express app (auth bypassed via the standard harness), and validates
 * each response body against the 200 schema declared in Servers/swagger.yaml
 * using ajv (devDependency, also used by scripts/apiContractSmoke.ts).
 *
 * Drift policy: structural guarantees (documented route, 200 status, JSON
 * body, envelope consistency) are hard assertions. Schema mismatches are
 * drift: they are recorded, reported at the end of the run, and matched
 * against KNOWN_DRIFT below. Drift already observed and triaged is listed
 * with its cause; *new* drift fails the suite so it cannot silently rot.
 * Follow-up tasks own the burndown — see Servers/docs/TESTING.md.
 *
 * Runs under `npm run test:integration` (Postgres-backed).
 */

jest.setTimeout(60_000);

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import YAML from "yamljs";
import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { createTestApp, testRequest } from "../setup";
import {
  cleanupDatabase,
  createTestOrganization,
  createTestUser,
  seedFrameworks,
} from "../helpers";
import {
  createTestFile,
  createTestProject,
  createTestRisk,
  createTestTask,
  linkRiskToProject,
} from "../../factories";

const SWAGGER_PATH = path.resolve(__dirname, "../../../swagger.yaml");

interface ContractCase {
  label: string;
  method: "get";
  /** Live API path under /api. `:{param}` is replaced with the seeded id. */
  apiPath: string;
  swaggerPath: string;
  /** Seed the rows this route lists/reads; returns the path params. */
  seed: (ctx: SeedContext) => Promise<Record<string, number>>;
}

interface SeedContext {
  orgId: number;
  userId: number;
}

/**
 * DRIFT BURNDOWN (#4502 follow-ups). Key: `METHOD swaggerPath`. Value: ajv
 * error patterns (dataPath + message substring) already observed and triaged.
 * Remove an entry only when the API or the swagger schema is fixed to match.
 *
 * Current known drift (see Servers/docs/TESTING.md § Contract pack):
 *   - GET /projectRisks (+ item): swagger declares `risk_category` as an
 *     array, the API serializes it as a comma-joined string (or null) —
 *     tracked in the #4502 follow-up; tighten the schema or the serializer.
 */
const KNOWN_DRIFT: Record<string, string[]> = {
  "GET /projectRisks": ["/data/0/risk_category must be array"],
  "GET /projectRisks/{id}": ["/data/risk_category must be array"],
};

const CONTRACT_CASES: ContractCase[] = [
  {
    label: "GET /api/dashboard",
    method: "get",
    apiPath: "/api/dashboard",
    swaggerPath: "/dashboard",
    seed: async (ctx) => {
      await createTestProject(ctx.orgId, ctx.userId);
      return {};
    },
  },
  {
    label: "GET /api/projects",
    method: "get",
    apiPath: "/api/projects",
    swaggerPath: "/projects",
    seed: async (ctx) => {
      await createTestProject(ctx.orgId, ctx.userId);
      return {};
    },
  },
  {
    label: "GET /api/projects/:id",
    method: "get",
    apiPath: "/api/projects/:id",
    swaggerPath: "/projects/{id}",
    seed: async (ctx) => ({ id: await createTestProject(ctx.orgId, ctx.userId) }),
  },
  {
    label: "GET /api/tasks",
    method: "get",
    apiPath: "/api/tasks",
    swaggerPath: "/tasks",
    seed: async (ctx) => {
      await createTestTask(ctx.orgId, { creator_id: ctx.userId });
      return {};
    },
  },
  {
    label: "GET /api/tasks/:id",
    method: "get",
    apiPath: "/api/tasks/:id",
    swaggerPath: "/tasks/{id}",
    seed: async (ctx) => ({
      id: await createTestTask(ctx.orgId, { creator_id: ctx.userId }),
    }),
  },
  {
    label: "GET /api/projectRisks",
    method: "get",
    apiPath: "/api/projectRisks",
    swaggerPath: "/projectRisks",
    seed: async (ctx) => {
      const projectId = await createTestProject(ctx.orgId, ctx.userId);
      const riskId = await createTestRisk(ctx.orgId, { risk_owner: ctx.userId });
      await linkRiskToProject(ctx.orgId, riskId, projectId);
      return {};
    },
  },
  {
    label: "GET /api/projectRisks/:id",
    method: "get",
    apiPath: "/api/projectRisks/:id",
    swaggerPath: "/projectRisks/{id}",
    seed: async (ctx) => {
      const projectId = await createTestProject(ctx.orgId, ctx.userId);
      const riskId = await createTestRisk(ctx.orgId, { risk_owner: ctx.userId });
      await linkRiskToProject(ctx.orgId, riskId, projectId);
      return { id: riskId };
    },
  },
  {
    label: "GET /api/files",
    method: "get",
    apiPath: "/api/files",
    swaggerPath: "/files",
    seed: async (ctx) => {
      const projectId = await createTestProject(ctx.orgId, ctx.userId);
      await createTestFile(ctx.orgId, ctx.userId, { project_id: projectId });
      return {};
    },
  },
  {
    label: "GET /api/users",
    method: "get",
    apiPath: "/api/users",
    swaggerPath: "/users",
    seed: async () => ({}),
  },
  {
    label: "GET /api/notifications/summary",
    method: "get",
    apiPath: "/api/notifications/summary",
    swaggerPath: "/notifications/summary",
    seed: async () => ({}),
  },
];

describe("OpenAPI contract pack (#4502)", () => {
  let app: http.Server;
  let orgId: number;
  let userId: number;

  const swagger = YAML.parse(fs.readFileSync(SWAGGER_PATH, "utf8"));
  const ajv = new Ajv({ strict: false, allErrors: true, coerceTypes: false });
  addFormats(ajv);

  /** Drift observed during this run, reported by the summary test. */
  const driftLog: Array<{ label: string; errors: ErrorObject[] }> = [];

  const validateAgainstSwagger = (
    swaggerPath: string,
    body: unknown,
  ): { schema: any; errors: ErrorObject[] | null } => {
    const schema =
      swagger.paths?.[swaggerPath]?.get?.responses?.["200"]?.content?.["application/json"]
        ?.schema ?? null;
    if (!schema) return { schema: null, errors: null };
    const validate = ajv.compile({ ...schema, components: swagger.components });
    const valid = validate(body);
    return { schema, errors: valid ? null : (validate.errors ?? []) };
  };

  beforeEach(async () => {
    orgId = await createTestOrganization();
    userId = await createTestUser(orgId, 1, `contract-${Date.now()}@test.com`, "Password123!");
    await seedFrameworks();
    app = await createTestApp({
      bypassAuth: true,
      mockUser: { userId, organizationId: orgId, role: "Admin" },
    });
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it.each(CONTRACT_CASES.map((c) => [c.label, c] as const))(
    "%s matches swagger.yaml",
    async (_label, contract) => {
      const params = await contract.seed({ orgId, userId });
      const apiPath = contract.apiPath.replace(/:(\w+)/g, (_m, name) => String(params[name]));
      const request = testRequest(app);

      const res = await request.get(apiPath);

      // Structural guarantees — hard assertions.
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(typeof res.body).toBe("object");
      expect(res.body).not.toBeNull();

      const { schema, errors } = validateAgainstSwagger(contract.swaggerPath, res.body);
      if (schema === null) {
        // DRIFT (follow-up, #4502): the route is documented but its 200
        // response carries no schema, so no drift-check is possible yet.
        // Recorded, warned, and asserted structurally only.
        // eslint-disable-next-line no-console
        console.warn(
          `[contract-drift] GET ${contract.swaggerPath}: 200 response has no schema in swagger.yaml`,
        );
        return;
      }

      if (errors) {
        const key = `GET ${contract.swaggerPath}`;
        const known = KNOWN_DRIFT[key] ?? [];
        const signature = (e: ErrorObject) => `${e.instancePath} ${e.message}`;
        const unexpected = errors.filter((e) => !known.some((k) => signature(e).startsWith(k)));
        if (unexpected.length > 0) {
          driftLog.push({ label: key, errors: unexpected });
          // Fail now with the exact drift so the author can triage it into
          // KNOWN_DRIFT or fix the API/swagger.
          expect(unexpected.map(signature)).toEqual([]);
        } else {
          // Known drift, still reported so the burndown stays visible.
          // eslint-disable-next-line no-console
          console.warn(
            `[contract-drift] ${key}: ${errors.map(signature).join("; ")} (known, follow-up)`,
          );
        }
      }
    },
    60_000,
  );

  it("reports the drift burndown summary", () => {
    if (driftLog.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[contract-drift] ${driftLog.length} route(s) with new schema drift this run: ` +
          driftLog.map((d) => d.label).join(", "),
      );
    }
    // This test exists to surface the report; drift details fail in their
    // route's own test above.
    expect(true).toBe(true);
  });
});
