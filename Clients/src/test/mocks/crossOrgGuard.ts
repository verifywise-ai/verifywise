/**
 * Opt-in MSW guard that answers a request for another organization's record
 * with a 403, the way a tenant-scoped backend would.
 *
 *   signInAs(OWN_ORG_ID);
 *   server.use(...crossOrgGuard());
 *   // ...and signOut() in afterEach
 *
 * Like errorHandlers.ts, it is never part of the default handler set, so
 * installing it can't change the behavior of any other test. Requests for the
 * caller's own records, unknown ids and literal segments ("/file-manager/search")
 * fall through to the normal handlers.
 *
 * The caller's organization comes from the Authorization header that
 * customAxios adds from the Redux store, decoded with the app's own
 * extractUserToken, so the header path is exercised too. `callerOrgId` is an
 * escape hatch for code that doesn't go through customAxios.
 *
 * The frontend counterpart of the backend isolation registry: adding an
 * entity is one entry in CROSS_ORG_ENTITIES.
 *
 * @see docs/technical/security/tenant-isolation.md
 */

import { http, HttpResponse, type HttpHandler } from "msw/http";
import { store } from "../../application/redux/store";
import { clearAuthState, setAuthToken } from "../../application/redux/auth/authSlice";
import { extractUserToken } from "../../application/tools/extractToken";
import { mockFiles } from "./data/files";
import { mockProjects } from "./data/projects";
import { mockRisks } from "./data/risks";
import { mockTasks } from "./data/tasks";
import {
  mockForeignFile,
  mockForeignProject,
  mockForeignRisk,
  mockForeignTask,
} from "./data/foreignOrg";

interface OwnedRecord {
  id: number;
  organization_id: number;
}

export interface CrossOrgEntity {
  name: string;
  /** By-id routes the frontend calls for this entity, in MSW path syntax. */
  paths: string[];
  /** Every record the handlers can serve for it, own and foreign. */
  records: () => OwnedRecord[];
}

export const CROSS_ORG_ENTITIES: CrossOrgEntity[] = [
  {
    name: "projects",
    paths: ["/api/projects/:id"],
    records: () => [...mockProjects, mockForeignProject],
  },
  {
    name: "risks",
    paths: ["/api/projectRisks/:id"],
    records: () => [...mockRisks, mockForeignRisk],
  },
  { name: "tasks", paths: ["/api/tasks/:id"], records: () => [...mockTasks, mockForeignTask] },
  {
    name: "files",
    paths: ["/api/file-manager/:id", "/api/file-manager/:id/*"],
    records: () => [...mockFiles, mockForeignFile],
  },
];

/**
 * 403 details that make customAxios log the user out instead of showing a
 * toast (the first branch of its response interceptor). A cross-org denial
 * must never use them, or the test would be testing logout.
 */
const LOGOUT_DETAILS = ["User does not belong to this organization", "Not allowed to access"];

/** HTTP reason phrase in `message`, detail in `data`, as STATUS_CODE[n] does. */
const REASON = { 403: "Forbidden", 404: "Not Found" } as const;

export interface CrossOrgGuardOptions {
  /** The caller's organization. Defaults to the one in the request's bearer token. */
  callerOrgId?: number;
  /** 403 per the isolation contract; 404 is what the real backend sends for a foreign id. */
  status?: 403 | 404;
  /** Human-readable detail, sent in `data`. */
  detail?: string;
}

export function crossOrgGuard({
  callerOrgId,
  status = 403,
  detail = "Access denied",
}: CrossOrgGuardOptions = {}): HttpHandler[] {
  if (LOGOUT_DETAILS.includes(detail)) {
    throw new Error(
      `crossOrgGuard: "${detail}" makes customAxios log the user out instead of showing ` +
        "an error toast. Use a different detail.",
    );
  }

  return CROSS_ORG_ENTITIES.flatMap(({ paths, records }) =>
    paths.map((path) =>
      http.all(path, ({ request, params }) => {
        const owner = records().find((r) => String(r.id) === String(params.id))?.organization_id;
        // Unknown id or a literal segment: not ours to judge.
        if (owner === undefined) return undefined;
        // The caller's own record: fall through to the success handler.
        if (owner === (callerOrgId ?? orgFromBearerToken(request))) return undefined;
        return HttpResponse.json({ message: REASON[status], data: detail }, { status });
      }),
    ),
  );
}

/**
 * Throws rather than falling through: a guard that silently let everything
 * pass because nobody was signed in would make every assertion vacuous. MSW
 * turns the throw into a 500, which fails the test visibly.
 */
function orgFromBearerToken(request: Request): number {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const orgId = Number(extractUserToken(token)?.organizationId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(
      "crossOrgGuard: the request carries no decodable bearer token. " +
        "Call signInAs(orgId) first, or pass callerOrgId.",
    );
  }
  return orgId;
}

/**
 * An unsigned token the app can decode. extractUserToken does no signature
 * check, and in tests MSW answers the requests, so a real signature is moot.
 */
export function fakeAuthToken(organizationId: number, userId = 1): string {
  const encode = (value: object) => btoa(JSON.stringify(value));
  const payload = {
    id: userId,
    email: `user${userId}@org${organizationId}.test`,
    organizationId,
    tenantId: `tenant-${organizationId}`,
    roleName: "Admin",
    expire: Date.now() + 60 * 60 * 1000,
  };
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.unsigned`;
}

/** Put a token for `organizationId` in the store customAxios reads. Pair with signOut(). */
export function signInAs(organizationId: number, userId = 1): void {
  store.dispatch(setAuthToken(fakeAuthToken(organizationId, userId)));
}

export function signOut(): void {
  store.dispatch(clearAuthState());
}
