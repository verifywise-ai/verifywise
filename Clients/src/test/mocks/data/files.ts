/**
 * File-manager fixtures.
 *
 * The shape mirrors what the backend actually returns — see the integration
 * tests in Servers/tests/integration/file-manager.test.ts, which pin the
 * `{ data: { files, pagination } }` envelope down against a real database. Keep
 * the two in step: a mock that drifts from the server is worse than no mock.
 */

export interface MockFile {
  id: number;
  filename: string;
  size: number;
  formattedSize: string;
  mimetype: string;
  upload_date: string;
  uploaded_by: number;
  uploader_name: string;
  uploader_surname: string;
  source: string;
  tags: string[];
  review_status: string;
  version: string;
  expiry_date: string | null;
  description: string | null;
  is_due_for_update: boolean;
  is_recently_modified: boolean;
}

export function createMockFile(overrides: Partial<MockFile> = {}): MockFile {
  return {
    id: 1,
    filename: "data-retention-policy.pdf",
    size: 20480,
    formattedSize: "20 KB",
    mimetype: "application/pdf",
    upload_date: "2026-02-01T00:00:00Z",
    uploaded_by: 1,
    uploader_name: "Test",
    uploader_surname: "User",
    source: "File Manager",
    tags: ["policy"],
    review_status: "approved",
    version: "1.0",
    expiry_date: null,
    description: null,
    is_due_for_update: false,
    is_recently_modified: false,
    ...overrides,
  };
}

export const mockFiles: MockFile[] = [
  createMockFile(),
  createMockFile({
    id: 2,
    filename: "vendor-assessment.xlsx",
    size: 51200,
    formattedSize: "50 KB",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    tags: ["vendor", "assessment"],
    review_status: "draft",
    expiry_date: "2026-03-01",
    is_due_for_update: true,
    is_recently_modified: true,
  }),
];

export function mockFilePagination(total = mockFiles.length) {
  return { total, page: 1, pageSize: 20, totalPages: Math.max(1, Math.ceil(total / 20)) };
}
