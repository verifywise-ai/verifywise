import {
  approveConfirmation,
  rejectConfirmation,
  getPendingConfirmations,
} from "../aiConfirmation.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiConfirmation.repository", () => {
  describe("approveConfirmation", () => {
    it("makes a post request to approve the confirmation and returns response data", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: { success: true } };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await approveConfirmation("conf-1");

      expect(apiServices.post).toHaveBeenCalledWith("/ai-confirmation/approve/conf-1");
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe("rejectConfirmation", () => {
    it("makes a post request to reject the confirmation and returns response data", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: { success: true } };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await rejectConfirmation("conf-2");

      expect(apiServices.post).toHaveBeenCalledWith("/ai-confirmation/reject/conf-2");
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe("getPendingConfirmations", () => {
    it("makes a get request to fetch pending confirmations", async () => {
      const mockResponse = { status: 200, statusText: "OK", data: [{ id: "conf-1" }] };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getPendingConfirmations();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-confirmation/pending");
      expect(result).toEqual(mockResponse.data);
    });
  });
});
