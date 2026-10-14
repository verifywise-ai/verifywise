import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const proxyOptions: any[] = [];
jest.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: (options: any) => {
    proxyOptions.push(options);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
  fixRequestBody: jest.fn(),
}));
jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../../controllers/aiGatewaySettings.ctrl", () => ({
  updateGuardrailSettings: jest.fn(),
}));

import aiGatewayRoutes from "../aiGateway.route";
import virtualKeyProxyRoutes from "../virtualKeyProxy.route";

const savedUrl = process.env.AI_GATEWAY_URL;

beforeEach(() => {
  proxyOptions.length = 0;
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.AI_GATEWAY_URL;
  else process.env.AI_GATEWAY_URL = savedUrl;
});

describe.each([
  ["/api/ai-gateway proxy", aiGatewayRoutes],
  ["/v1 virtual key proxy", virtualKeyProxyRoutes],
])("%s target", (_name, buildRoutes) => {
  it("resolves the gateway URL per request, not once when the router is built", async () => {
    process.env.AI_GATEWAY_URL = "http://gateway-at-startup:8100";
    buildRoutes();
    const options = proxyOptions[0];
    expect(options.target).toBe("http://gateway-at-startup:8100");

    process.env.AI_GATEWAY_URL = "  http://gateway-now:8100\n";
    expect(await options.router({}, undefined, options)).toBe("http://gateway-now:8100");
  });
});
