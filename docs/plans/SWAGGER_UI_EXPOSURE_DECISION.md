# Decision Record: Swagger UI Exposure

## Context

The backend currently serves Swagger UI at `/api/docs` via `swagger-ui-express` in all environments. The OpenAPI spec loaded is `Servers/swagger.yaml`. Once the documentation unification work is complete, the spec will be fully generated from the route layer, making `/api/docs` a complete and accurate map of the API surface.

## Decision

**Restrict Swagger UI to non-production environments only.**

### Rationale

- Exposing a complete, up-to-date API map in production increases information disclosure risk with no user-facing benefit.
- Internal developers, QA, and security reviewers can still access the docs in development and staging.
- The restriction is simple to implement (`process.env.NODE_ENV !== "production"`) and easy to verify.

## Implementation notes

- In `Servers/app.ts`, wrap the `/api/docs` mount in an environment check:

  ```ts
  if (process.env.NODE_ENV !== "production") {
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  }
  ```

- Document this policy in `Servers/CLAUDE.md`.
- The OpenAPI spec itself remains available in the repository and is used by the frontend endpoint generator; only the interactive Swagger UI page is restricted.

## Alternative considered

Gate `/api/docs` behind `authenticateJWT`. Rejected because even authenticated users in production do not need interactive API docs, and the auth-gated page would still expose endpoint shapes to anyone with a valid token.
