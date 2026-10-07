jest.mock("../mlflow.service", () => ({
  loadConfiguration: jest.fn(),
  syncModels: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn() },
  logStructured: jest.fn(),
}));

import { syncFromMlflow } from "../mlflow.ctrl";
import { loadConfiguration, syncModels } from "../mlflow.service";

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("syncFromMlflow", () => {
  const req: any = { organizationId: 1, t: (s: string) => s };

  beforeEach(() => {
    (loadConfiguration as jest.Mock).mockResolvedValue({ tracking_server_url: "https://mlflow" });
  });

  it("returns 502 with the failure reason in `error`", async () => {
    (syncModels as jest.Mock).mockResolvedValue({
      success: false,
      modelCount: 0,
      syncedAt: "",
      status: "failed: Failed to fetch runs: HTTP 403",
      error: "Failed to fetch runs: HTTP 403",
    });
    const res = mockRes();
    await syncFromMlflow(req, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      message: "Bad Gateway",
      error: "Failed to fetch runs: HTTP 403",
    });
  });

  it("returns 200 with the result on success", async () => {
    const result = { success: true, modelCount: 3, syncedAt: "", status: "success" };
    (syncModels as jest.Mock).mockResolvedValue(result);
    const res = mockRes();
    await syncFromMlflow(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "OK", data: result });
  });
});
