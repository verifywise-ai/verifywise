import { getDeadlineSummary } from "../deadline.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deadline.repository", () => {
  describe("getDeadlineSummary", () => {
    it("makes a get request without a query string when days is not provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { data: { tasks: { overdue: 2, dueSoon: 3, threshold: 7 } } },
      });

      await getDeadlineSummary();

      expect(apiServices.get).toHaveBeenCalledWith("/deadlines/summary");
    });

    it("makes a get request with a threshold query string when days is provided", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { data: { tasks: { overdue: 1, dueSoon: 2, threshold: 14 } } },
      });

      await getDeadlineSummary(14);

      expect(apiServices.get).toHaveBeenCalledWith("/deadlines/summary?threshold=14");
    });

    it("maps the backend task counts into the summary shape", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { data: { tasks: { overdue: 5, dueSoon: 8, threshold: 7 } } },
      });

      const result = await getDeadlineSummary();

      expect(result).toEqual({
        data: { overdue: 5, dueSoon: 8, dueSoonDays: 7 },
      });
    });

    it("defaults to zero counts when the backend response has no tasks payload", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: {} });

      const result = await getDeadlineSummary();

      expect(result).toEqual({
        data: { overdue: 0, dueSoon: 0, dueSoonDays: 7 },
      });
    });

    it("defaults dueSoonDays to the provided days when tasks payload is missing", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: {} });

      const result = await getDeadlineSummary(21);

      expect(result).toEqual({
        data: { overdue: 0, dueSoon: 0, dueSoonDays: 21 },
      });
    });
  });
});
