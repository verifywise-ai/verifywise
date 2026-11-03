import { getMcpTools } from "../mcp.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mcp.repository", () => {
  /** The MCP transport answers 406 unless Accept lists both content types. */
  it("asks /mcp for tools/list, accepting JSON and an event stream", async () => {
    vi.mocked(apiServices.post).mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {} as any,
      data: { jsonrpc: "2.0", id: 1, result: { tools: [{ name: "list_risks" }] } },
    });

    const tools = await getMcpTools();

    expect(apiServices.post).toHaveBeenCalledWith(
      "/mcp",
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      expect.objectContaining({ headers: { Accept: "application/json, text/event-stream" } }),
    );
    expect(tools).toEqual([{ name: "list_risks" }]);
  });

  it("returns no tools when the answer carries no result", async () => {
    vi.mocked(apiServices.post).mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {} as any,
      data: { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } },
    });
    expect(await getMcpTools()).toEqual([]);
  });
});
