import { updateEntityById } from "../entity.repository";
import { updateEUAIActQuestionStatus } from "../euaiact.repository";

vi.mock("../entity.repository", () => ({
  updateEntityById: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test EU AI Act Repository", () => {
  describe("updateEUAIActQuestionStatus", () => {
    it("should call updateEntityById with correct routeUrl and FormData fields, returning true on success", async () => {
      vi.mocked(updateEntityById).mockResolvedValue({ status: 200 });

      const result = await updateEUAIActQuestionStatus({
        answerId: 42,
        newStatus: "done",
        userId: 7,
      });

      expect(result).toBe(true);

      const call = vi.mocked(updateEntityById).mock.calls[0][0];
      expect(call.routeUrl).toBe("/eu-ai-act/saveAnswer/42");

      const body = call.body as FormData;
      expect(body.get("status")).toBe("done");
      expect(body.get("user_id")).toBe("7");
      expect(body.get("delete")).toBe(JSON.stringify([]));
      expect(body.get("risksDelete")).toBe(JSON.stringify([]));
      expect(body.get("risksMitigated")).toBe(JSON.stringify([]));
    });

    it("should return false when updateEntityById returns a falsy value (undefined)", async () => {
      vi.mocked(updateEntityById).mockResolvedValue(undefined);

      const result = await updateEUAIActQuestionStatus({
        answerId: 1,
        newStatus: "pending",
        userId: 3,
      });

      expect(result).toBe(false);
    });

    it("should return false when updateEntityById returns null", async () => {
      vi.mocked(updateEntityById).mockResolvedValue(null);

      const result = await updateEUAIActQuestionStatus({
        answerId: 1,
        newStatus: "pending",
        userId: 3,
      });

      expect(result).toBe(false);
    });

    it("should log the error and return false when updateEntityById throws", async () => {
      const error = new Error("Patch failed");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      vi.mocked(updateEntityById).mockRejectedValue(error);

      const result = await updateEUAIActQuestionStatus({
        answerId: 99,
        newStatus: "rejected",
        userId: 5,
      });

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to update EU AI Act question status:",
        error,
      );

      consoleErrorSpy.mockRestore();
    });

    it("should build the routeUrl using the provided answerId", async () => {
      vi.mocked(updateEntityById).mockResolvedValue({ status: 200 });

      await updateEUAIActQuestionStatus({
        answerId: 123,
        newStatus: "done",
        userId: 1,
      });

      expect(vi.mocked(updateEntityById).mock.calls[0][0].routeUrl).toBe(
        "/eu-ai-act/saveAnswer/123",
      );
    });
  });
});
