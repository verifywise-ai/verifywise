const uploadFile = jest.fn();
jest.mock("../../../utils/fileUpload.utils", () => ({ uploadFile: (...a: any) => uploadFile(...a) }));
import { deliverReport } from "../reportDeliveryService";

describe("deliverReport", () => {
  beforeEach(() => { uploadFile.mockReset(); });
  it("saves to storage when enabled and reports success", async () => {
    uploadFile.mockResolvedValue({ id: 123 });
    const res = await deliverReport({ saveToStorage: true, sendEmailLink: false, attachFile: false, recipients: [] } as any,
      { content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" } as any, { organizationId: 1, userId: 2 } as any);
    expect(res.storage.status).toBe("success");
    expect(res.storage.fileId).toBe(123);
    expect(res.emailLink.status).toBe("skipped");
  });
  it("one channel failure does not throw; marks failed", async () => {
    uploadFile.mockRejectedValue(new Error("disk full"));
    const res = await deliverReport({ saveToStorage: true, sendEmailLink: false, attachFile: false, recipients: [] } as any,
      { content: Buffer.from("x"), filename: "r.pdf", mimeType: "application/pdf" } as any, { organizationId: 1, userId: 2 } as any);
    expect(res.storage.status).toBe("failed");
  });
});
