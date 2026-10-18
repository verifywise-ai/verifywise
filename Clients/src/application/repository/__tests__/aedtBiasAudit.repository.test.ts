import { beforeEach, describe, expect, it, vi } from "vitest";

const { downloadStance } = vi.hoisted(() => ({ downloadStance: vi.fn() }));

vi.mock("../../../infrastructure/api/aedtBiasAuditService", () => ({
  aedtBiasAuditService: { downloadStance },
}));

import { downloadAedtStance } from "../aedtBiasAudit.repository";

describe("downloadAedtStance", () => {
  const blob = new Blob(["%PDF"]);
  beforeEach(() => downloadStance.mockReset());

  it("reads an RFC 5987 file name", async () => {
    downloadStance.mockResolvedValue({
      blob,
      disposition:
        "attachment; filename=\"stance.pdf\"; filename*=UTF-8''Stance%20%C3%A9t%C3%A9.pdf",
    });
    await expect(downloadAedtStance(3)).resolves.toEqual({ blob, filename: "Stance été.pdf" });
  });

  it("reads a quoted file name", async () => {
    downloadStance.mockResolvedValue({ blob, disposition: 'attachment; filename="stance-v2.pdf"' });
    await expect(downloadAedtStance(3)).resolves.toMatchObject({ filename: "stance-v2.pdf" });
  });

  it("falls back to the stance id when the header is not exposed", async () => {
    downloadStance.mockResolvedValue({ blob, disposition: undefined });
    await expect(downloadAedtStance(3)).resolves.toMatchObject({ filename: "stance-3.pdf" });
  });
});
