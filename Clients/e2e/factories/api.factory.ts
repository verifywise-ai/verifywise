import { APIRequestContext, request } from "@playwright/test";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { existsSync, mkdtempSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://localhost:3000";
const SUPER_ADMIN_EMAIL = process.env.E2E_EMAIL || "verifywise@email.com";
const SUPER_ADMIN_PASSWORD = process.env.E2E_PASSWORD || "Verifywise#1";
const SERVERS_DIR = path.resolve(__dirname, "../../../Servers");
const E2E_NODE_ENV = process.env.E2E_NODE_ENV || "test";

export interface Credentials {
  email: string;
  password: string;
}

export interface ApiContext {
  request: APIRequestContext;
  token: string;
  userId: number;
  organizationId: number | null;
  roleName: string;
}

export interface AdminSeedResult extends Credentials {
  userId: number;
  orgId: number;
}

function decodeJwtPayload(token: string): Record<string, any> {
  const base64 = token.split(".")[1];
  const json = Buffer.from(base64, "base64url").toString("utf-8");
  return JSON.parse(json);
}

function buildTestEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: E2E_NODE_ENV };
  if (E2E_NODE_ENV === "test") {
    const envTestPath = path.resolve(SERVERS_DIR, ".env.test");
    if (existsSync(envTestPath)) {
      Object.assign(env, dotenv.parse(readFileSync(envTestPath, "utf8")));
    }
  }
  return env;
}

/**
 * Create a backend API request context authenticated as the given user.
 * If no credentials are supplied, the default super-admin is used.
 */
export async function createApiContext(
  credentials?: Credentials,
): Promise<ApiContext> {
  const ctx = await request.newContext({ baseURL: BACKEND_URL });
  const creds = credentials ?? {
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
  };

  const response = await ctx.post("/api/users/login", { data: creds });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `API login failed for ${creds.email}: ${response.status()} ${body}`,
    );
  }
  const json = (await response.json()) as { data: { token: string } };
  const token = json?.data?.token;
  if (!token) {
    throw new Error(`Login response did not contain a token: ${JSON.stringify(json)}`);
  }

  const payload = decodeJwtPayload(token);
  return {
    request: ctx,
    token,
    userId: payload.id as number,
    organizationId: (payload.organizationId as number | null) ?? null,
    roleName: (payload.roleName as string) || "",
  };
}

async function apiPost<T = any>(
  ctx: ApiContext,
  path: string,
  data: unknown,
): Promise<T> {
  const response = await ctx.request.post(path, {
    data,
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`POST ${path} failed: ${response.status()} ${body}`);
  }
  return response.json() as Promise<T>;
}

async function apiDelete<T = any>(ctx: ApiContext, path: string): Promise<T> {
  const response = await ctx.request.delete(path, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`DELETE ${path} failed: ${response.status()} ${body}`);
  }
  return response.json() as Promise<T>;
}

function unwrapData<T>(body: any): T {
  if (body && "data" in body) {
    return body.data as T;
  }
  throw new Error(`Unexpected API response shape: ${JSON.stringify(body)}`);
}

export const orgs = {
  /**
   * Create an organization. Requires a super-admin context.
   */
  async create(ctx: ApiContext, name: string): Promise<number> {
    const body = await apiPost<{ data: { id: number } }>(ctx, "/api/super-admin/organizations", { name });
    return unwrapData<{ id: number }>(body).id;
  },

  /**
   * Delete an organization and all of its data (cascades to users/projects/etc).
   * Requires a super-admin context.
   */
  async delete(ctx: ApiContext, id: number): Promise<void> {
    await apiDelete(ctx, `/api/super-admin/organizations/${id}`);
  },
};

export const users = {
  /**
   * Seed a real Admin user inside an organization via the existing DB script.
   * Returns the credentials needed to log in as that admin.
   */
  async seedAdmin(
    ctx: ApiContext,
    orgId: number,
    overrides: Partial<Credentials & { name: string; surname: string }> = {},
  ): Promise<AdminSeedResult> {
    const email = overrides.email ?? `e2e-admin-${Date.now()}@verifywise.local`;
    const password = overrides.password ?? "E2EAdmin#1";
    const name = overrides.name ?? "E2E";
    const surname = overrides.surname ?? "Admin";

    const tmpDir = mkdtempSync(path.join(tmpdir(), "vw-e2e-"));
    const credentialsFile = path.join(tmpDir, "e2e-credentials.json");

    const stdout = execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      [
        "ts-node",
        "scripts/seedE2EAdmin.ts",
        String(orgId),
        `--output-file=${credentialsFile}`,
        `--email=${email}`,
        `--password=${password}`,
        `--name=${name}`,
        `--surname=${surname}`,
      ],
      {
        cwd: SERVERS_DIR,
        encoding: "utf-8",
        env: buildTestEnv(),
        shell: true,
      },
    );

    const lastLine = stdout.trim().split("\n").pop() || "";
    const metadata = JSON.parse(lastLine) as {
      orgId: number;
      userId: number;
      email: string;
      credentialsFile: string;
    };

    if (!metadata.credentialsFile) {
      throw new Error("seedE2EAdmin did not write a credentials file");
    }

    const credentials = JSON.parse(
      readFileSync(metadata.credentialsFile, "utf-8"),
    ) as AdminSeedResult;

    try {
      unlinkSync(metadata.credentialsFile);
    } catch {
      // Best-effort cleanup
    }

    return credentials;
  },
};

export interface CreateProjectPayload {
  project_title: string;
  owner: number;
  start_date: string;
  goal: string;
  ai_risk_classification?: string;
  type_of_high_risk_role?: string;
  members?: number[];
  framework?: number[];
  enable_ai_data_insertion?: boolean;
}

export const projects = {
  async create(
    ctx: ApiContext,
    payload: CreateProjectPayload,
  ): Promise<{ id: number; project_title: string }> {
    const body = await apiPost<{ data: { project: { id: number; project_title: string } } }>(
      ctx,
      "/api/projects",
      {
        ...payload,
        members: payload.members ?? [payload.owner],
      },
    );
    return unwrapData<{ project: { id: number; project_title: string } }>(body).project;
  },

  async delete(ctx: ApiContext, id: number): Promise<void> {
    await apiDelete(ctx, `/api/projects/${id}`);
  },
};

export interface CreateProjectRiskPayload {
  risk_name: string;
  risk_owner: number;
  risk_description?: string;
  ai_lifecycle_phase?: string;
  risk_category?: string[];
  impact?: string;
  projects?: number[];
  risk_level_autocalculated?: string;
  current_risk_level?: string;
}

export const projectRisks = {
  async create(
    ctx: ApiContext,
    payload: CreateProjectRiskPayload,
  ): Promise<{ id: number; risk_name: string }> {
    const body = await apiPost<{ data: { id: number; risk_name: string } }>(
      ctx,
      "/api/projectRisks",
      payload,
    );
    return unwrapData<{ id: number; risk_name: string }>(body);
  },

  async delete(ctx: ApiContext, id: number): Promise<void> {
    await apiDelete(ctx, `/api/projectRisks/${id}`);
  },
};

export interface CreateVendorPayload {
  vendor_name: string;
  vendor_provides: string;
  assignee?: number;
  reviewer?: number;
  projects?: number[];
  website?: string;
  vendor_contact_person?: string;
  review_result?: string;
  review_status?: string;
  review_date?: string;
  order_no?: string;
  data_sensitivity?: string;
  business_criticality?: string;
  past_issues?: string;
  regulatory_exposure?: string;
  risk_score?: number;
}

export const vendors = {
  async create(
    ctx: ApiContext,
    payload: CreateVendorPayload,
  ): Promise<{ id: number; vendor_name: string }> {
    const body = await apiPost<{ data: { id: number; vendor_name: string } }>(
      ctx,
      "/api/vendors",
      { ...payload, is_demo: false },
    );
    return unwrapData<{ id: number; vendor_name: string }>(body);
  },

  async delete(ctx: ApiContext, id: number): Promise<void> {
    await apiDelete(ctx, `/api/vendors/${id}`);
  },
};

export interface CreateTaskPayload {
  title: string;
  description?: string;
  due_date?: string;
  priority?: "Low" | "Medium" | "High";
  status?: "Open" | "In Progress" | "Completed" | "Overdue";
  assignees?: number[];
  categories?: number[];
  entity_links?: Array<{ entity_id: number; entity_type: string; entity_name?: string }>;
}

export const tasks = {
  async create(
    ctx: ApiContext,
    payload: CreateTaskPayload,
  ): Promise<{ id: number; title: string }> {
    const body = await apiPost<{ data: { id: number; title: string } }>(
      ctx,
      "/api/tasks",
      payload,
    );
    return unwrapData<{ id: number; title: string }>(body);
  },

  async delete(ctx: ApiContext, id: number): Promise<void> {
    await apiDelete(ctx, `/api/tasks/${id}`);
  },
};
