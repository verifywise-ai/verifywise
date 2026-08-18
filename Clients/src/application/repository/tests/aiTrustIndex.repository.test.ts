import {
  getApps,
  getApp,
  getTracked,
  trackApp,
  trackAppsBulk,
  untrackApp,
  getSettings,
  updateSettings,
} from "../aiTrustIndex.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiTrustIndex.repository", () => {
  describe("getApps", () => {
    it("builds a query string from the provided params", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { apps: [] } });

      await getApps({ search: "chat", category: "llm", page: 2, pageSize: 20 });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/ai-trust-index/apps?search=chat&category=llm&page=2&pageSize=20",
      );
    });

    it("skips empty-string params and defaults to no params", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { apps: [] } });

      await getApps();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-trust-index/apps?");
    });
  });

  describe("getApp", () => {
    it("makes a get request scoped to the encoded slug", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: { slug: "my app" } });

      const result = await getApp("my app");

      expect(apiServices.get).toHaveBeenCalledWith("/ai-trust-index/apps/my%20app");
      expect(result).toEqual({ slug: "my app" });
    });
  });

  describe("getTracked", () => {
    it("makes a get request for tracked apps", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({ data: [] });

      await getTracked();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-trust-index/tracked");
    });
  });

  describe("trackApp", () => {
    it("makes a post request with the slug", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { tracked: true } });

      const result = await trackApp("chat-gpt");

      expect(apiServices.post).toHaveBeenCalledWith("/ai-trust-index/tracked", {
        slug: "chat-gpt",
      });
      expect(result).toEqual({ tracked: true });
    });
  });

  describe("trackAppsBulk", () => {
    it("makes a post request with a list of slugs", async () => {
      vi.mocked(apiServices.post).mockResolvedValue({ data: { tracked: 2 } });

      await trackAppsBulk(["a", "b"]);

      expect(apiServices.post).toHaveBeenCalledWith("/ai-trust-index/tracked/bulk", {
        slugs: ["a", "b"],
      });
    });
  });

  describe("untrackApp", () => {
    it("makes a delete request scoped to the encoded slug", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({ data: { tracked: false } });

      await untrackApp("chat gpt");

      expect(apiServices.delete).toHaveBeenCalledWith("/ai-trust-index/tracked/chat%20gpt");
    });
  });

  describe("getSettings", () => {
    it("makes a get request for settings", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        data: { recipientUserIds: [1], recipientEmails: [] },
      });

      const result = await getSettings();

      expect(apiServices.get).toHaveBeenCalledWith("/ai-trust-index/settings");
      expect(result).toEqual({ recipientUserIds: [1], recipientEmails: [] });
    });
  });

  describe("updateSettings", () => {
    it("makes a put request with the settings payload", async () => {
      const body = { recipientUserIds: [1, 2], recipientEmails: ["a@b.com"] };
      vi.mocked(apiServices.put).mockResolvedValue({ data: body });

      const result = await updateSettings(body);

      expect(apiServices.put).toHaveBeenCalledWith("/ai-trust-index/settings", body);
      expect(result).toEqual(body);
    });
  });
});
