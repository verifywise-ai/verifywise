import { Request, Response } from "express";

// Mock global fetch before importing controller
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mock setup
import { verifyApiKey } from "../controllers/aiGateway.ctrl";

function makeReq(body: object): Partial<Request> {
  return { body };
}

function makeRes(): { status: jest.Mock; json: jest.Mock; statusCode: number } {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("verifyApiKey", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns 400 when provider is missing", async () => {
    const req = makeReq({ apiKey: "sk-abc" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: false }));
  });

  it("returns 400 when apiKey is missing", async () => {
    const req = makeReq({ provider: "openai" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: false }));
  });

  it("returns valid: true when provider API returns 200", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const req = makeReq({ provider: "openai", apiKey: "sk-abc123" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: true }));
  });

  it("returns valid: false when provider API returns 401", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const req = makeReq({ provider: "openai", apiKey: "sk-bad" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: false }));
  });

  it("returns valid: false when provider API returns 403", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const req = makeReq({ provider: "anthropic", apiKey: "sk-ant-bad" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: false }));
  });

  it("assumes valid when provider API returns 429 (rate limited)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const req = makeReq({ provider: "mistral", apiKey: "somekey123" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: true }));
  });

  it("maps gemini provider to Google verification endpoint", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const req = makeReq({ provider: "gemini", apiKey: "AIzaABCDEFGHIJKLMN1234567890123456789" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("generativelanguage.googleapis.com");
  });

  it("assumes valid for unknown providers (bedrock, azure, etc.)", async () => {
    const req = makeReq({ provider: "bedrock", apiKey: "some-aws-key" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: true }));
  });

  it("assumes valid when fetch throws a network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));
    const req = makeReq({ provider: "openai", apiKey: "sk-abc" });
    const res = makeRes();
    await verifyApiKey(req as Request, res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ valid: true }));
  });
});
