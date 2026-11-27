import request from "supertest";
import express from "express";

// The session decides who and which organization: x-user / x-org / x-role /
// x-super stand in for its claims; no Authorization header is a 401.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 7);
    req.organizationId =
      req.headers["x-org"] === "none" ? undefined : Number(req.headers["x-org"] ?? 3);
    req.role = req.headers["x-role"] ?? "Admin";
    req.isSuperAdmin = req.headers["x-super"] === "true";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../mcp/oauth", () => ({
  readAuthorizationRequest: jest.fn(),
  approveAuthorizationRequest: jest.fn(async () => "http://localhost:4567/callback?code=c&state=s"),
  denyAuthorizationRequest: jest.fn(() => "http://localhost:4567/callback?error=access_denied"),
  mcpOAuthProvider: {
    clientsStore: {
      getClient: jest.fn(),
      registerClient: jest.fn(async (client: object) => client),
    },
    authorize: jest.fn(),
    challengeForAuthorizationCode: jest.fn(),
    exchangeAuthorizationCode: jest.fn(),
    exchangeRefreshToken: jest.fn(),
    verifyAccessToken: jest.fn(),
    revokeToken: jest.fn(),
  },
}));
jest.mock("../../../utils/mcpOAuth.utils", () => ({
  getUserGrantsQuery: jest.fn(async () => [{ id: 11, client_name: "Claude Code" }]),
  revokeUserGrantQuery: jest.fn(),
}));
jest.mock("../../../utils/organization.utils", () => ({
  getOrganizationByIdQuery: jest.fn(async (id: number) => ({ id, name: "Acme" })),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../mcpOAuth.route";
import {
  approveAuthorizationRequest,
  denyAuthorizationRequest,
  mcpOAuthProvider,
  readAuthorizationRequest,
} from "../../../mcp/oauth";
import { getUserGrantsQuery, revokeUserGrantQuery } from "../../../utils/mcpOAuth.utils";

const app = express();
app.use(express.json());
app.use("/api/v1/oauth", routes);

const pending = {
  clientId: "client-1",
  clientName: "Claude Code",
  redirectUri: "http://localhost:4567/callback",
  codeChallenge: "challenge",
  state: "s",
  resource: "https://vw.example.com/api/mcp",
};

describe("/api/v1/oauth", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("consent", () => {
    it("answers 401 without a session", async () => {
      expect((await request(app).get("/api/v1/oauth/authorization-requests")).status).toBe(401);
      expect(
        (await request(app).post("/api/v1/oauth/authorization-requests/decision").send({})).status,
      ).toBe(401);
    });

    it("rejects an invalid or expired request", async () => {
      (readAuthorizationRequest as jest.Mock).mockResolvedValue(null);
      const res = await request(app)
        .get("/api/v1/oauth/authorization-requests?request=bad")
        .set("Authorization", "Bearer t");
      expect(res.status).toBe(400);
    });

    it("shows the client, where the browser goes next, and whether this user may allow it", async () => {
      (readAuthorizationRequest as jest.Mock).mockResolvedValue(pending);
      const admin = await request(app)
        .get("/api/v1/oauth/authorization-requests?request=r")
        .set("Authorization", "Bearer t");
      expect(admin.status).toBe(200);
      expect(admin.body.data).toEqual({
        clientName: "Claude Code",
        redirectHost: "localhost:4567",
        organizationName: "Acme",
        canAllow: true,
      });

      const editor = await request(app)
        .get("/api/v1/oauth/authorization-requests?request=r")
        .set("Authorization", "Bearer t")
        .set("x-role", "Editor");
      expect(editor.body.data.canAllow).toBe(false);
    });

    it("issues a code for the session's organization when an Admin allows", async () => {
      (readAuthorizationRequest as jest.Mock).mockResolvedValue(pending);
      const res = await request(app)
        .post("/api/v1/oauth/authorization-requests/decision")
        .set("Authorization", "Bearer t")
        .send({ request: "r", allow: true });
      expect(res.status).toBe(200);
      expect(res.body.data.redirectUrl).toBe("http://localhost:4567/callback?code=c&state=s");
      expect(approveAuthorizationRequest).toHaveBeenCalledWith(pending, {
        userId: 7,
        organizationId: 3,
      });
    });

    it("issues a pure super admin's code without an organization", async () => {
      (readAuthorizationRequest as jest.Mock).mockResolvedValue(pending);
      await request(app)
        .post("/api/v1/oauth/authorization-requests/decision")
        .set("Authorization", "Bearer t")
        .set("x-org", "none")
        .set("x-role", "SuperAdmin")
        .set("x-super", "true")
        .send({ request: "r", allow: true });
      expect(approveAuthorizationRequest).toHaveBeenCalledWith(pending, {
        userId: 7,
        organizationId: null,
      });
    });

    it("refuses a user who could not use the MCP server", async () => {
      (readAuthorizationRequest as jest.Mock).mockResolvedValue(pending);
      const res = await request(app)
        .post("/api/v1/oauth/authorization-requests/decision")
        .set("Authorization", "Bearer t")
        .set("x-role", "Editor")
        .send({ request: "r", allow: true });
      expect(res.status).toBe(403);
      expect(approveAuthorizationRequest).not.toHaveBeenCalled();
    });

    it("sends a declined request back with access_denied, for anyone", async () => {
      (readAuthorizationRequest as jest.Mock).mockResolvedValue(pending);
      const res = await request(app)
        .post("/api/v1/oauth/authorization-requests/decision")
        .set("Authorization", "Bearer t")
        .set("x-role", "Editor")
        .send({ request: "r", allow: false });
      expect(res.status).toBe(200);
      expect(res.body.data.redirectUrl).toContain("error=access_denied");
      expect(denyAuthorizationRequest).toHaveBeenCalledWith(pending);
      expect(approveAuthorizationRequest).not.toHaveBeenCalled();
    });
  });

  describe("connections", () => {
    it("lists the signed-in user's connections", async () => {
      const res = await request(app)
        .get("/api/v1/oauth/connections")
        .set("Authorization", "Bearer t")
        .set("x-user", "5");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ id: 11, client_name: "Claude Code" }]);
      expect(getUserGrantsQuery).toHaveBeenCalledWith(5);
    });

    it("revokes only the user's own connection", async () => {
      (revokeUserGrantQuery as jest.Mock).mockResolvedValueOnce(true);
      const ok = await request(app)
        .delete("/api/v1/oauth/connections/11")
        .set("Authorization", "Bearer t")
        .set("x-user", "5");
      expect(ok.status).toBe(200);
      expect(revokeUserGrantQuery).toHaveBeenCalledWith(11, 5);

      (revokeUserGrantQuery as jest.Mock).mockResolvedValueOnce(false);
      const missing = await request(app)
        .delete("/api/v1/oauth/connections/12")
        .set("Authorization", "Bearer t");
      expect(missing.status).toBe(404);

      const invalid = await request(app)
        .delete("/api/v1/oauth/connections/abc")
        .set("Authorization", "Bearer t");
      expect(invalid.status).toBe(400);
    });
  });

  describe("OAuth endpoints", () => {
    it("registers a public client without a secret", async () => {
      const res = await request(app)
        .post("/api/v1/oauth/register")
        .send({
          client_name: "Claude Code",
          redirect_uris: ["http://localhost:4567/callback"],
          token_endpoint_auth_method: "none",
        });
      expect(res.status).toBe(201);
      expect(res.body.client_id).toEqual(expect.any(String));
      expect(res.body.client_secret).toBeUndefined();
      expect(mcpOAuthProvider.clientsStore.registerClient).toHaveBeenCalled();
    });

    it("rejects authorization for an unknown client before redirecting anywhere", async () => {
      (mcpOAuthProvider.clientsStore.getClient as jest.Mock).mockResolvedValue(undefined);
      const res = await request(app).get(
        "/api/v1/oauth/authorize?client_id=nope&redirect_uri=http://localhost:4567/callback&response_type=code&code_challenge=c&code_challenge_method=S256",
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_client");
      expect(mcpOAuthProvider.authorize).not.toHaveBeenCalled();
    });

    it("hands a valid authorization request to the provider", async () => {
      (mcpOAuthProvider.clientsStore.getClient as jest.Mock).mockResolvedValue({
        client_id: "client-1",
        redirect_uris: ["http://localhost:4567/callback"],
      });
      (mcpOAuthProvider.authorize as jest.Mock).mockImplementation(async (_c, _p, res) =>
        res.redirect(302, "/mcp/authorize?request=r"),
      );
      const res = await request(app).get(
        "/api/v1/oauth/authorize?client_id=client-1&redirect_uri=http://localhost:4567/callback&response_type=code&code_challenge=c&code_challenge_method=S256&state=s",
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/mcp/authorize?request=r");
      expect((mcpOAuthProvider.authorize as jest.Mock).mock.calls[0][1]).toMatchObject({
        redirectUri: "http://localhost:4567/callback",
        codeChallenge: "c",
        state: "s",
      });
    });
  });
});
