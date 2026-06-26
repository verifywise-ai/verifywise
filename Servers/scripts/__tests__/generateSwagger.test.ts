import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseRouteFile,
  expressPathToOpenApiPath,
  deriveTag,
  mergeSwagger,
  Endpoint,
} from "../generateSwagger";

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
});
