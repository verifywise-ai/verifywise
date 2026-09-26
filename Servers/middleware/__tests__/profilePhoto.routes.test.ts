/**
 * Route-stack regression tests for the profile photo endpoints.
 *
 * Ensures the mutating /users/:id/profile-photo routes (POST and DELETE)
 * are protected by the selfOnly middleware, so an authenticated user
 * cannot upload or delete another user's profile photo (IDOR).
 */

// The token hashing module requires a server-side HMAC secret at load time.
process.env.API_TOKEN_HASH_SECRET = "test-api-token-hash-secret";

import router from "../../routes/user.route";
import { selfOnly } from "../selfOnly.middleware";

type Method = "post" | "delete" | "get";

const findLayers = (method: Method, pathFragment: string) =>
  (router as any).stack.filter((layer: any) => {
    if (!layer.route) return false;
    if (layer.route.methods[method] !== true) return false;
    return layer.route.path === pathFragment;
  });

describe("profile photo route stack", () => {
  const PATH = "/:id/profile-photo";

  it("POST /:id/profile-photo includes selfOnly middleware", () => {
    const layers = findLayers("post", PATH);
    expect(layers).toHaveLength(1);
    const stack = layers[0].route.stack.map((l: any) => l.handle);
    expect(stack).toContain(selfOnly);
  });

  it("DELETE /:id/profile-photo includes selfOnly middleware", () => {
    const layers = findLayers("delete", PATH);
    expect(layers).toHaveLength(1);
    const stack = layers[0].route.stack.map((l: any) => l.handle);
    expect(stack).toContain(selfOnly);
  });

  it("selfOnly runs before the multer upload handler on POST", () => {
    const layers = findLayers("post", PATH);
    const names = layers[0].route.stack.map((l: any) => l.handle?.name || "");
    const selfIdx = names.indexOf("selfOnly");
    const multerIdx = names.findIndex((n: string) => n.startsWith("multer"));
    expect(selfIdx).toBeGreaterThan(-1);
    expect(multerIdx).toBeGreaterThan(selfIdx);
  });
});
