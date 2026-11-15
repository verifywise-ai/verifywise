import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseRouteFile,
  expressPathToOpenApiPath,
  deriveTag,
  mergeSwagger,
  findUnmatchedDeprecations,
  Endpoint,
} from "../generateSwagger";
import { API_DEPRECATIONS, ApiDeprecation, deprecationNotice } from "../apiDeprecations";

describe("generateSwagger", () => {
  describe("parseRouteFile", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-routes-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("parses basic GET/POST/PUT/DELETE routes", () => {
      const content = `
import express from "express";
const router = express.Router();

router.get("/", authenticateJWT, getAll);
router.post("/", authenticateJWT, createOne);
router.put("/:id", authenticateJWT, updateOne);
router.patch("/:id", authenticateJWT, patchOne);
router.delete("/:id", authenticateJWT, deleteOne);

export default router;
`;
      const filePath = path.join(tmpDir, "basic.route.ts");
      fs.writeFileSync(filePath, content, "utf-8");

      const endpoints = parseRouteFile(filePath);
      expect(endpoints).toHaveLength(5);
      expect(
        endpoints.map((e) => ({
          method: e.method,
          routePath: e.routePath,
          handlerName: e.handlerName,
          auth: e.auth,
        })),
      ).toEqual([
        { method: "get", routePath: "/", handlerName: "getAll", auth: true },
        { method: "post", routePath: "/", handlerName: "createOne", auth: true },
        { method: "put", routePath: "/:id", handlerName: "updateOne", auth: true },
        { method: "patch", routePath: "/:id", handlerName: "patchOne", auth: true },
        { method: "delete", routePath: "/:id", handlerName: "deleteOne", auth: true },
      ]);
    });

    it("detects router-level authenticateJWT", () => {
      const content = `
import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";

router.use(authenticateJWT);

router.get("/", getAll);
router.post("/", createOne);

export default router;
`;
      const filePath = path.join(tmpDir, "router-auth.route.ts");
      fs.writeFileSync(filePath, content, "utf-8");

      const endpoints = parseRouteFile(filePath);
      expect(endpoints).toHaveLength(2);
      expect(endpoints.every((e) => e.auth)).toBe(true);
    });

    it("detects unauthenticated routes", () => {
      const content = `
import express from "express";
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

export default router;
`;
      const filePath = path.join(tmpDir, "public.route.ts");
      fs.writeFileSync(filePath, content, "utf-8");

      const endpoints = parseRouteFile(filePath);
      expect(endpoints).toHaveLength(2);
      expect(endpoints.every((e) => !e.auth)).toBe(true);
    });

    it("extracts roles from authorize middleware", () => {
      const content = `
import express from "express";
const router = express.Router();

router.post("/", authenticateJWT, authorize(["Admin", "Editor"]), createOne);

export default router;
`;
      const filePath = path.join(tmpDir, "roles.route.ts");
      fs.writeFileSync(filePath, content, "utf-8");

      const endpoints = parseRouteFile(filePath);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].roles).toContain("Admin");
      expect(endpoints[0].roles).toContain("Editor");
    });

    it("handles controller-qualified handler names", () => {
      const content = `
import express from "express";
const router = express.Router();

router.post("/import/docx", authenticateJWT, upload.single("file"), PolicyController.importDocx);

export default router;
`;
      const filePath = path.join(tmpDir, "qualified.route.ts");
      fs.writeFileSync(filePath, content, "utf-8");

      const endpoints = parseRouteFile(filePath);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].handlerName).toBe("PolicyController.importDocx");
      expect(endpoints[0].auth).toBe(true);
    });

    it("ignores commented-out routes", () => {
      const content = `
import express from "express";
const router = express.Router();

router.get("/", authenticateJWT, getAll);
// router.post("/", authenticateJWT, createOne);

export default router;
`;
      const filePath = path.join(tmpDir, "commented.route.ts");
      fs.writeFileSync(filePath, content, "utf-8");

      const endpoints = parseRouteFile(filePath);
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].method).toBe("get");
    });
  });

  describe("expressPathToOpenApiPath", () => {
    it("removes /api prefix and converts :params to {params}", () => {
      expect(expressPathToOpenApiPath("/api/users/:id")).toBe("/users/{id}");
    });

    it("keeps / for root paths", () => {
      expect(expressPathToOpenApiPath("/api/assessments")).toBe("/assessments");
    });

    it("strips trailing slashes", () => {
      expect(expressPathToOpenApiPath("/api/users/")).toBe("/users");
    });

    it("handles nested parameters", () => {
      expect(expressPathToOpenApiPath("/api/projects/:id/tasks/:taskId")).toBe(
        "/projects/{id}/tasks/{taskId}",
      );
    });
  });

  describe("deriveTag", () => {
    it("returns known tags from the tag map", () => {
      expect(deriveTag("/api/users")).toBe("Users");
      expect(deriveTag("/api/projects")).toBe("Projects");
      expect(deriveTag("/api/assessments")).toBe("Assessments");
    });

    it("returns a formatted fallback for unknown base paths", () => {
      expect(deriveTag("/api/new-feature")).toBe("New Feature");
    });

    it("handles change-history paths", () => {
      expect(deriveTag("/api/project-change-history")).toBe("Change History");
    });

    it("names the v1 vendor research routes after their resource, not their version prefix", () => {
      expect(deriveTag("/api/v1/vendors")).toBe("Vendors");
      expect(deriveTag("/api/v1/vendor-research")).toBe("Vendor Research");
      expect(deriveTag("/api/v1/vendor-risk-findings")).toBe("Vendor Risk Findings");
    });
  });

  describe("mergeSwagger", () => {
    it("adds bearerAuth security for authenticated endpoints", () => {
      const endpoints: Endpoint[] = [
        {
          method: "get",
          routePath: "/",
          handlerName: "getAll",
          auth: true,
          roles: [],
          path: "/api/users",
          openApiPath: "/users",
          tag: "Users",
          basePath: "/api/users",
          routeFile: "user.route.ts",
        },
      ];

      const merged = mergeSwagger(endpoints, {});
      expect(merged.paths["/users"].get.security).toEqual([{ bearerAuth: [] }]);
    });

    it("does not add security for public endpoints", () => {
      const endpoints: Endpoint[] = [
        {
          method: "post",
          routePath: "/login",
          handlerName: "loginUser",
          auth: false,
          roles: [],
          path: "/api/users/login",
          openApiPath: "/users/login",
          tag: "Authentication",
          basePath: "/api/users",
          routeFile: "user.route.ts",
        },
      ];

      const merged = mergeSwagger(endpoints, {});
      expect(merged.paths["/users/login"].post.security).toBeUndefined();
    });

    it("preserves existing operation metadata", () => {
      const existing = {
        paths: {
          "/users": {
            get: {
              summary: "Existing summary",
              description: "Existing description",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      const endpoints: Endpoint[] = [
        {
          method: "get",
          routePath: "/",
          handlerName: "getAll",
          auth: true,
          roles: [],
          path: "/api/users",
          openApiPath: "/users",
          tag: "Users",
          basePath: "/api/users",
          routeFile: "user.route.ts",
        },
      ];

      const merged = mergeSwagger(endpoints, existing);
      expect(merged.paths["/users"].get.description).toBe("Existing description");
      expect(merged.paths["/users"].get.responses["200"].description).toBe("OK");
      expect(merged.paths["/users"].get.tags).toEqual(["Users"]);
    });

    it("generates unique operationIds for duplicate handler names", () => {
      const endpoints: Endpoint[] = [
        {
          method: "get",
          routePath: "/",
          handlerName: "getAll",
          auth: true,
          roles: [],
          path: "/api/users",
          openApiPath: "/users",
          tag: "Users",
          basePath: "/api/users",
          routeFile: "user.route.ts",
        },
        {
          method: "get",
          routePath: "/",
          handlerName: "getAll",
          auth: true,
          roles: [],
          path: "/api/projects",
          openApiPath: "/projects",
          tag: "Projects",
          basePath: "/api/projects",
          routeFile: "project.route.ts",
        },
      ];

      const merged = mergeSwagger(endpoints, {});
      const userOpId = merged.paths["/users"].get.operationId;
      const projectOpId = merged.paths["/projects"].get.operationId;
      expect(userOpId).not.toBe(projectOpId);
      expect(userOpId).toBeTruthy();
      expect(projectOpId).toBeTruthy();
    });
  });

  describe("deprecation list (ADR 0001 §7)", () => {
    const endpoint = (roles: string[] = []): Endpoint => ({
      method: "put",
      routePath: "/:id/review/approve",
      handlerName: "PolicyController.approveReview",
      auth: true,
      roles,
      path: "/api/policies/:id/review/approve",
      openApiPath: "/policies/{id}/review/approve",
      tag: "Policies",
      basePath: "/api/policies",
      routeFile: "policy.route.ts",
    });
    const entry: ApiDeprecation = {
      method: "put",
      path: "/policies/{id}/review/approve",
      sunset: "not before v9.9.0",
      replacement: "Use POST /v1/things instead.",
    };
    const existing = (description: string) => ({
      paths: {
        "/policies/{id}/review/approve": {
          put: { description, responses: { "200": { description: "OK" } } },
        },
      },
    });

    it("marks a listed operation deprecated and puts the notice first", () => {
      const merged = mergeSwagger([endpoint()], existing("Approves the review.\n"), [entry]);
      const op = merged.paths["/policies/{id}/review/approve"].put;
      expect(op.deprecated).toBe(true);
      expect(op.description).toBe(`${deprecationNotice(entry)}\n\nApproves the review.\n`);
    });

    it("keeps the notice ahead of the role note", () => {
      const merged = mergeSwagger([endpoint(["Admin"])], existing("Approves the review."), [entry]);
      const op = merged.paths["/policies/{id}/review/approve"].put;
      expect(op.description).toBe(
        `${deprecationNotice(entry)}\n\nApproves the review. Requires role: Admin`,
      );
    });

    it("is stable across regenerations (no description growth)", () => {
      const once = mergeSwagger([endpoint(["Admin"])], existing("Approves the review.\n"), [entry]);
      const twice = mergeSwagger([endpoint(["Admin"])], once, [entry]);
      const thrice = mergeSwagger([endpoint(["Admin"])], twice, [entry]);
      expect(thrice).toEqual(once);
    });

    it("uses the notice alone when the operation had no description", () => {
      const merged = mergeSwagger([endpoint()], {}, [entry]);
      expect(merged.paths["/policies/{id}/review/approve"].put.description).toBe(
        deprecationNotice(entry),
      );
    });

    it("removes the notice and the flag when an entry leaves the list", () => {
      const deprecated = mergeSwagger([endpoint()], existing("Approves the review.\n"), [entry]);
      const restored = mergeSwagger([endpoint()], deprecated, []);
      const op = restored.paths["/policies/{id}/review/approve"].put;
      expect(op.deprecated).toBeUndefined();
      expect(op.description).toBe("Approves the review.\n");
    });

    it("leaves operations that are not listed untouched", () => {
      const merged = mergeSwagger([endpoint()], existing("Approves the review."), []);
      const op = merged.paths["/policies/{id}/review/approve"].put;
      expect(op.deprecated).toBeUndefined();
      expect(op.description).toBe("Approves the review.");
    });

    it("reports entries that match no endpoint", () => {
      const stale: ApiDeprecation = { ...entry, path: "/policies/{id}/gone" };
      expect(findUnmatchedDeprecations([endpoint()], [entry, stale])).toEqual([stale]);
    });

    it("lists the three legacy policy review endpoints", () => {
      expect(API_DEPRECATIONS.map((d) => `${d.method} ${d.path}`)).toEqual([
        "post /policies/{id}/review/request",
        "put /policies/{id}/review/approve",
        "put /policies/{id}/review/reject",
      ]);
    });
  });
});
