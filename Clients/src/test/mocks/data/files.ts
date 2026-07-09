export interface MockFile {
  id: number;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  folderId: number | null;
  entityType: string | null;
  entityId: number | null;
  uploadedBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface MockFolder {
  id: number;
  name: string;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export function createMockFile(overrides: Partial<MockFile> = {}): MockFile {
  return {
    id: 1,
    name: "document.pdf",
    url: "https://example.com/files/document.pdf",
    size: 1024,
    mimeType: "application/pdf",
    folderId: null,
    entityType: null,
    entityId: null,
    uploadedBy: 1,
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export function createMockFolder(overrides: Partial<MockFolder> = {}): MockFolder {
  return {
    id: 1,
    name: "Compliance",
    parentId: null,
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export const mockFiles: MockFile[] = [createMockFile()];
export const mockFolders: MockFolder[] = [createMockFolder()];
