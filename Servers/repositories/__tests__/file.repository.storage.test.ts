import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Mock the DB layer so the SQL and replacements each function emits can be
// inspected, and mock the storage layer so provider routing can be exercised
// without any network or SDK.
const mockQuery = jest.fn<any>();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

const mockPut = jest.fn<any>();
const mockBuildStorageKey = jest.fn<any>();
const mockResolveFileContent = jest.fn<any>();
jest.mock("../../services/storage", () => ({
  getFileStorage: () => ({ put: (...args: any[]) => mockPut(...args) }),
  buildStorageKey: (...args: any[]) => mockBuildStorageKey(...args),
  resolveFileContent: (...args: any[]) => mockResolveFileContent(...args),
}));

const mockRegisterPendingPut = jest.fn<any>();
const mockDeleteObjectOnCommit = jest.fn<any>();
jest.mock("../../services/storage/transactionRegistry", () => ({
  registerPendingPut: (...args: any[]) => mockRegisterPendingPut(...args),
  deleteObjectOnCommit: (...args: any[]) => mockDeleteObjectOnCommit(...args),
}));

jest.mock("../../utils/retention.utils", () => {
  const actual = jest.requireActual("../../utils/retention.utils") as any;
  return {
    ...actual,
    resolveFileExpiryOnCreate: jest
      .fn<any>()
      .mockResolvedValue({ expiry_date: null, retention_policy: null }),
  };
});

import { deleteFileById, getFilePreview, uploadOrganizationFile } from "../file.repository";

const ORG_ID = 7;

function multerFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: "report final.pdf",
    buffer: Buffer.from("pdf-bytes"),
    mimetype: "application/pdf",
    size: 9,
    ...overrides,
  } as Express.Multer.File;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildStorageKey.mockReturnValue("files/org-7/uuid-report_final.pdf");
});

describe("uploadOrganizationFile — storage routing", () => {
  it("writes the buffer into content with NULL storage columns under the local provider", async () => {
    mockPut.mockResolvedValueOnce({ provider: "local", key: null });
    mockQuery.mockResolvedValueOnce([{ id: 1 }]);

    await uploadOrganizationFile(multerFile(), 5, ORG_ID, ORG_ID);

    const [, options] = mockQuery.mock.calls[0] as [string, any];
    expect(options.replacements).toMatchObject({
      content: Buffer.from("pdf-bytes"),
      storage_provider: null,
      storage_key: null,
    });
    expect(mockRegisterPendingPut).toHaveBeenCalledWith(undefined, {
      provider: "local",
      key: null,
    });
  });

  it("stores NULL content and records provider and key under the s3 provider", async () => {
    const ref = { provider: "s3" as const, key: "files/org-7/uuid-report_final.pdf" };
    mockPut.mockResolvedValueOnce(ref);
    mockQuery.mockResolvedValueOnce([{ id: 1 }]);
    const transaction = { id: "txn" } as any;

    await uploadOrganizationFile(multerFile(), 5, ORG_ID, ORG_ID, { transaction });

    expect(mockPut).toHaveBeenCalledWith({
      key: "files/org-7/uuid-report_final.pdf",
      body: Buffer.from("pdf-bytes"),
      contentType: "application/pdf",
    });
    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("storage_provider, storage_key");
    expect(options.replacements).toMatchObject({
      content: null,
      storage_provider: "s3",
      storage_key: ref.key,
    });
    expect(mockRegisterPendingPut).toHaveBeenCalledWith(transaction, ref);
  });
});

describe("deleteFileById — external object cleanup", () => {
  it("queues the object delete on commit when the row carries a storage key", async () => {
    const transaction = { id: "txn" } as any;
    mockQuery
      .mockResolvedValueOnce([]) // file_folder_mappings cleanup
      .mockResolvedValueOnce([]) // file_entity_links cleanup
      .mockResolvedValueOnce([{ id: 3, storage_provider: "s3", storage_key: "files/org-7/k" }]);

    const deleted = await deleteFileById(3, ORG_ID, transaction);

    expect(deleted).toBe(true);
    const [sql] = mockQuery.mock.calls[2] as [string, any];
    expect(sql).toContain("RETURNING id, storage_provider, storage_key");
    expect(mockDeleteObjectOnCommit).toHaveBeenCalledWith(transaction, {
      provider: "s3",
      key: "files/org-7/k",
    });
  });

  it("queues nothing for a row whose bytes live in the content column", async () => {
    const transaction = { id: "txn" } as any;
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3, storage_provider: null, storage_key: null }]);

    await deleteFileById(3, ORG_ID, transaction);

    expect(mockDeleteObjectOnCommit).not.toHaveBeenCalled();
  });
});

describe("getFilePreview — lazy content resolution", () => {
  it("resolves bytes via storage when the row has a storage key", async () => {
    const resolved = Buffer.from("resolved-bytes");
    mockQuery.mockResolvedValueOnce([
      {
        id: 9,
        filename: "a.pdf",
        mimetype: "application/pdf",
        size: 15,
        content: null,
        storage_provider: "s3",
        storage_key: "files/org-7/k",
      },
    ]);
    mockResolveFileContent.mockResolvedValueOnce(resolved);

    const preview = await getFilePreview(9, ORG_ID);

    const [sql] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toMatch(/storage_provider/);
    expect(sql).toMatch(/storage_key/);
    expect(mockResolveFileContent).toHaveBeenCalledTimes(1);
    expect(preview).toMatchObject({ canPreview: true, content: resolved });
  });

  it("uses the content column directly when the row has no storage key", async () => {
    const content = Buffer.from("db-bytes");
    mockQuery.mockResolvedValueOnce([
      {
        id: 9,
        filename: "a.pdf",
        mimetype: "application/pdf",
        size: 8,
        content,
        storage_provider: null,
        storage_key: null,
      },
    ]);
    mockResolveFileContent.mockResolvedValueOnce(content);

    const preview = await getFilePreview(9, ORG_ID);

    expect(preview).toMatchObject({ canPreview: true, content });
  });

  it("reports canPreview false when no bytes exist anywhere", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: 9,
        filename: "a.pdf",
        mimetype: "application/pdf",
        size: 0,
        content: null,
        storage_provider: "s3",
        storage_key: "files/org-7/missing",
      },
    ]);
    mockResolveFileContent.mockResolvedValueOnce(null);

    const preview = await getFilePreview(9, ORG_ID);

    expect(preview).toMatchObject({ canPreview: false });
    expect(preview!.content).toHaveLength(0);
  });
});
