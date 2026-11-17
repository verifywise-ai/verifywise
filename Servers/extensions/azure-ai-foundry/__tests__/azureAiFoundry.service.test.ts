jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../services/extension/extensionService", () => ({ ExtensionService: {} }));
jest.mock("../../../utils/safeOutboundUrl", () => ({ safeFetchWithBase: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { safeFetchWithBase } from "../../../utils/safeOutboundUrl";
import logger from "../../../utils/logger/fileLogger";
import { discoverAgents } from "../azureAiFoundry.service";

const fetchMock = safeFetchWithBase as jest.Mock;
const config = { project_endpoint: "https://example.services.ai.azure.com", api_key: "k" };

describe("discoverAgents", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends the request with an abort signal", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    await discoverAgents(config);

    const init = fetchMock.mock.calls[0][2];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns no agents and logs the limits when Azure does not answer in time", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted", "TimeoutError"));

    await expect(discoverAgents(config)).resolves.toEqual([]);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("request timed out (limit 30s"),
    );
  });

  it("reports a network failure as connection failed, without the detail", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }),
    );

    await expect(discoverAgents(config)).resolves.toEqual([]);

    expect(logger.warn).toHaveBeenCalledWith(
      "[azure-ai-foundry] Agent discovery failed: connection failed",
    );
  });
});
