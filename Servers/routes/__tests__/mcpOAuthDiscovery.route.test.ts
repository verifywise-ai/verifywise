import request from "supertest";
import express from "express";

// Who the token is: x-role / x-org stand in for its claims; "Bearer revoked"
// is a token the middleware rejects. Only the gate is under test here.
jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: jest.fn(),
  authenticateJWTForMcp: (req: any, res: any, next: any) => {
    if (req.headers.authorization === "Bearer revoked") {
      return res.status(401).json({ message: "API token is invalid or has been revoked" });
    }
    req.userId = 7;
    req.role = req.headers["x-role"] ?? "Admin";
    req.organizationId = 3;
    next();
  },
}));
jest.mock("../../mcp/server", () => ({ buildMcpServer: jest.fn() }));
jest.mock("../../database/db", () => ({ sequelize: {} }));

import mcpRoutes from "../mcp.route";
import metadataRoutes from "../mcpOAuthMetadata.route";

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.t = (key: string) => key;
  next();
});
app.use("/api/mcp", mcpRoutes);
app.use("/.well-known", metadataRoutes);

const CHALLENGE =
  'Bearer resource_metadata="https://vw.example.com/.well-known/oauth-protected-resource/api/mcp"';

describe("MCP sign-in discovery", () => {
  beforeEach(() => {
    process.env.FRONTEND_URL = "https://vw.example.com";
  });

  /** RFC 9728 §5.1: the 401 is how a client finds where to sign in. */
  it("answers a request without a token with 401 and the resource metadata", async () => {
    const res = await request(app).post("/api/mcp").send({});
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe(CHALLENGE);
  });

  it("names the resource metadata when a token is rejected too", async () => {
    const res = await request(app).post("/api/mcp").set("Authorization", "Bearer revoked").send({});
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe(CHALLENGE);
  });

  it("does not challenge a signed-in user the gate refuses", async () => {
    const res = await request(app)
      .post("/api/mcp")
      .set("Authorization", "Bearer t")
      .set("x-role", "Editor")
      .send({});
    expect(res.status).toBe(403);
    expect(res.headers["www-authenticate"]).toBeUndefined();
  });

  it("serves both discovery documents", async () => {
    const resource = await request(app).get("/.well-known/oauth-protected-resource/api/mcp");
    expect(resource.status).toBe(200);
    expect(resource.body).toMatchObject({
      resource: "https://vw.example.com/api/mcp",
      authorization_servers: ["https://vw.example.com/api/v1/oauth"],
    });
    const server = await request(app).get("/.well-known/oauth-authorization-server/api/v1/oauth");
    expect(server.status).toBe(200);
    expect(server.body.token_endpoint).toBe("https://vw.example.com/api/v1/oauth/token");
  });

  it("offers no sign-in without FRONTEND_URL", async () => {
    delete process.env.FRONTEND_URL;
    const res = await request(app).post("/api/mcp").send({});
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBeUndefined();
    expect((await request(app).get("/.well-known/oauth-protected-resource/api/mcp")).status).toBe(
      404,
    );
  });
});
