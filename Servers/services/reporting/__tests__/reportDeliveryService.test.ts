jest.mock("../../../utils/fileUpload.utils", () => ({ uploadFile: jest.fn() }));
jest.mock("../../emailService", () => ({ sendAutomationEmail: jest.fn() }));
jest.mock("../../../tools/mjmlCompiler", () => ({
  compileMjmlToHtml: jest.fn(async () => "<html>report ready</html>"),
}));

import { deliverReport } from "../reportDeliveryService";
import { uploadFile } from "../../../utils/fileUpload.utils";
import { sendAutomationEmail } from "../../emailService";

const artifact = {
  content: Buffer.from("PDFDATA"),
  filename: "report.pdf",
  mimeType: "application/pdf",
};
const ctx = { organizationId: 42, userId: 9, runId: 5 };

beforeEach(() => jest.clearAllMocks());

describe("deliverReport", () => {
  it("actually sends an email when sendEmailLink is enabled", async () => {
    (uploadFile as jest.Mock).mockResolvedValue({ id: 100 });
    (sendAutomationEmail as jest.Mock).mockResolvedValue(undefined);

    const res = await deliverReport(
      { saveToStorage: true, sendEmailLink: true, recipients: ["a@example.com"] },
      artifact,
      ctx,
    );

    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = (sendAutomationEmail as jest.Mock).mock.calls[0];
    expect(to).toEqual(["a@example.com"]);
    expect(typeof subject).toBe("string");
    expect(body).toContain("report ready");
    expect(res.emailLink.status).toBe("success");
  });

  it("records failed with the real error when the send throws", async () => {
    (uploadFile as jest.Mock).mockResolvedValue({ id: 100 });
    (sendAutomationEmail as jest.Mock).mockRejectedValue(new Error("SMTP 550 rejected"));

    const res = await deliverReport(
      { saveToStorage: true, sendEmailLink: true, recipients: ["a@example.com"] },
      artifact,
      ctx,
    );

    expect(res.emailLink.status).toBe("failed");
    expect(res.emailLink.error).toContain("SMTP 550");
    // Storage still succeeded — a failed email must not lose the report.
    expect(res.storage.status).toBe("success");
    expect(res.fileId).toBe(100);
  });

  it("attaches the artifact when attachFile is enabled", async () => {
    (sendAutomationEmail as jest.Mock).mockResolvedValue(undefined);

    await deliverReport(
      { attachFile: true, recipients: ["a@example.com", "b@example.com"] },
      artifact,
      ctx,
    );

    const [to, , , attachments] = (sendAutomationEmail as jest.Mock).mock.calls[0];
    expect(to).toHaveLength(2);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("report.pdf");
    expect(attachments[0].content).toBe(artifact.content);
  });

  it("sends one email when both email channels are on, not two", async () => {
    (sendAutomationEmail as jest.Mock).mockResolvedValue(undefined);

    await deliverReport(
      { sendEmailLink: true, attachFile: true, recipients: ["a@example.com"] },
      artifact,
      ctx,
    );

    expect(sendAutomationEmail).toHaveBeenCalledTimes(1);
  });

  it("does not claim success when there are no recipients", async () => {
    const res = await deliverReport({ sendEmailLink: true, recipients: [] }, artifact, ctx);

    expect(sendAutomationEmail).not.toHaveBeenCalled();
    expect(res.emailLink.status).toBe("failed");
    expect(res.emailLink.error).toMatch(/recipient/i);
  });

  it("skips every channel that is not enabled", async () => {
    const res = await deliverReport({}, artifact, ctx);
    expect(res.storage.status).toBe("skipped");
    expect(res.emailLink.status).toBe("skipped");
    expect(res.attachment.status).toBe("skipped");
    expect(uploadFile).not.toHaveBeenCalled();
    expect(sendAutomationEmail).not.toHaveBeenCalled();
  });

  // Pre-existing coverage: a storage failure is recorded, not thrown.
  it("one channel failure does not throw; marks failed", async () => {
    (uploadFile as jest.Mock).mockRejectedValue(new Error("disk full"));

    const res = await deliverReport({ saveToStorage: true }, artifact, ctx);

    expect(res.storage.status).toBe("failed");
    expect(res.storage.error).toBe("disk full");
  });
});
