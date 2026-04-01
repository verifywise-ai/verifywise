# File Storage

## Overview

VerifyWise stores files directly in the PostgreSQL database as BLOB (bytea) data, not on the filesystem. This approach integrates with multi-tenancy, supports transactions, and simplifies backup/restore. The system uses Multer for upload handling (memory storage) and Uppy on the frontend for advanced upload UX.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FILE UPLOAD FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   Frontend       │                                                       │
│  │   (Uppy)         │                                                       │
│  └────────┬─────────┘                                                       │
│           │ POST /file-manager (multipart/form-data)                        │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  Multer          │  (Memory storage - no disk I/O)                       │
│  │  Middleware      │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  File Controller │                                                       │
│  │  - Auth check    │                                                       │
│  │  - Role check    │                                                       │
│  │  - Validation    │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  File Repository │                                                       │
│  │  - Sanitize name │                                                       │
│  │  - INSERT BLOB   │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  PostgreSQL      │                                                       │
│  │  {tenant}.files  │  (Binary content stored as BLOB)                      │
│  └──────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            FILE DOWNLOAD FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐                                                       │
│  │   Frontend       │  GET /file-manager/:id                                │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  Auth Middleware │                                                       │
│  │  - JWT verify    │                                                       │
│  │  - Access check  │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  File Controller │                                                       │
│  │  - canUserAccess │                                                       │
│  │  - Log access    │                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐     Set headers:                                      │
│  │  PostgreSQL      │     Content-Type: [mime-type]                         │
│  │  SELECT content  │     Content-Disposition: attachment                   │
│  └────────┬─────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐                                                       │
│  │  res.end(blob)   │  Stream binary to browser                             │
│  └──────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Files Table

```sql
-- Table: {tenant}.files

CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,        -- Sanitized filename
  content BYTEA,                          -- Binary file data (BLOB)
  type VARCHAR(100),                      -- MIME type (e.g., "application/pdf")
  size BIGINT,                            -- File size in bytes
  uploaded_by INTEGER REFERENCES public.users(id),
  uploaded_time TIMESTAMP DEFAULT NOW(),
  project_id INTEGER REFERENCES projects(id),  -- NULL for org-level files
  org_id INTEGER REFERENCES public.organizations(id),
  model_id INTEGER,                       -- ML model association
  file_path VARCHAR(500),                 -- Original path/name (metadata)
  source file_source_enum,                -- File origin category
  is_demo BOOLEAN DEFAULT FALSE
);
```

### File Access Logs Table

```sql
-- Table: {tenant}.file_access_logs

CREATE TABLE file_access_logs (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES files(id),
  accessed_by INTEGER REFERENCES public.users(id),
  access_date TIMESTAMP DEFAULT NOW(),
  action VARCHAR(20) CHECK (action IN ('download', 'view')),
  org_id INTEGER REFERENCES public.organizations(id)
);

CREATE INDEX idx_file_access_logs_file_id ON file_access_logs(file_id);
CREATE INDEX idx_file_access_logs_accessed_by ON file_access_logs(accessed_by);
```

### File Source Enum

Files are categorized by their origin/purpose:

```typescript
type FileSource =
  | "Assessment tracker group"
  | "Compliance tracker group"
  | "Management system clauses group"
  | "Reference controls group"
  | "Main clauses group"
  | "Annex controls group"
  | "Project risks report"
  | "Compliance tracker report"
  | "Assessment tracker report"
  | "Vendors and risks report"
  | "All reports"
  | "Clauses and annexes report"
  | "AI trust center group"
  | "ISO 27001 report"
  | "Models and risks report"
  | "Training registry report"
  | "Policy manager report"
  | "File Manager"
  | "policy_editor"
  | "Post-Market Monitoring report";
```

## Backend Implementation

### Multer Configuration

```typescript
// File: Servers/middleware/upload.middleware.ts

import multer from "multer";

// Memory storage - no disk I/O
const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 30 * 1024 * 1024,  // 30MB max
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});
```

### Allowed File Types

```typescript
// File: Servers/utils/validations/fileManagerValidation.utils.ts

const ALLOWED_MIME_TYPES = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/markdown",

  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",

  // Videos
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/webm",
  "video/x-matroska",
];
```

### File Repository

```typescript
// File: Servers/repositories/file.repository.ts

import { sanitize } from "sanitize-filename";

export async function uploadOrganizationFile(
  file: Express.Multer.File,
  userId: number,
  orgId: number,
  modelId: number | null,
  source: string,
  tenant: string,
  transaction?: Transaction
): Promise<FileModel> {
  validateTenant(tenant);

  const sanitizedFilename = sanitize(file.originalname);

  const query = `
    INSERT INTO ${escapePgIdentifier(tenant)}.files
      (filename, content, type, size, uploaded_by, uploaded_time,
       org_id, model_id, source, is_demo)
    VALUES
      (:filename, :content, :type, :size, :uploaded_by, NOW(),
       :org_id, :model_id, :source, false)
    RETURNING *
  `;

  const [results] = await sequelize.query(query, {
    replacements: {
      filename: sanitizedFilename,
      content: file.buffer,
      type: file.mimetype,
      size: file.size,
      uploaded_by: userId,
      org_id: orgId,
      model_id: modelId,
      source: source,
    },
    transaction,
  });

  return results[0] as FileModel;
}

export async function getFileById(
  fileId: number,
  tenant: string
): Promise<FileModel | null> {
  validateTenant(tenant);

  const query = `
    SELECT * FROM ${escapePgIdentifier(tenant)}.files
    WHERE id = :fileId
  `;

  const [results] = await sequelize.query(query, {
    replacements: { fileId },
  });

  return results[0] as FileModel || null;
}

export async function deleteFile(
  fileId: number,
  tenant: string,
  transaction?: Transaction
): Promise<void> {
  validateTenant(tenant);

  const query = `
    DELETE FROM ${escapePgIdentifier(tenant)}.files
    WHERE id = :fileId
  `;

  await sequelize.query(query, {
    replacements: { fileId },
    transaction,
  });
}
```

### File Controller

```typescript
// File: Servers/controllers/fileManager.ctrl.ts

export const uploadFile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const { model_id, source } = req.body;
    const { userId, tenantId, organizationId } = req;

    // Validate file
    const validation = validateFileUpload(file);
    if (!validation.isValid) {
      return res.status(400).json({ message: validation.error });
    }

    // Upload to database
    const uploadedFile = await uploadOrganizationFile(
      file,
      userId,
      organizationId,
      model_id ? parseInt(model_id) : null,
      source || "File Manager",
      tenantId
    );

    return res.status(201).json({
      id: uploadedFile.id,
      filename: uploadedFile.filename,
      size: uploadedFile.size,
      type: uploadedFile.type,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const downloadFile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.id);
    const { userId, tenantId, organizationId } = req;

    // Get file
    const file = await getFileById(fileId, tenantId);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Check access
    const canAccess = await canUserAccessFile(userId, fileId, tenantId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Log access
    await logFileAccess(fileId, userId, organizationId, "download", tenantId);

    // Send file
    res.setHeader("Content-Type", file.type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`
    );
    res.end(file.content);
  } catch (error) {
    console.error("Download failed:", error);
    return res.status(500).json({ message: "Download failed" });
  }
};
```

### Access Control

```typescript
// File: Servers/utils/files/canUserAccessFile.ts

export const canUserAccessFile = async (
  userId: number,
  fileId: number,
  tenantId: string
): Promise<boolean> => {
  const file = await getFileById(fileId, tenantId);
  if (!file) return false;

  const user = await getUserById(userId);

  // Admins can access all files
  if (user.roleName === "Admin") return true;

  // User uploaded the file
  if (file.uploaded_by === userId) return true;

  // Project file - check membership
  if (file.project_id) {
    const isOwner = await isProjectOwner(userId, file.project_id, tenantId);
    if (isOwner) return true;

    const isMember = await isProjectMember(userId, file.project_id, tenantId);
    if (isMember) return true;
  }

  // Org-level file - check org membership
  if (file.org_id) {
    const userOrg = await getUserOrganization(userId);
    if (userOrg === file.org_id) return true;
  }

  return false;
};
```

## API Routes

```typescript
// File: Servers/routes/fileManager.route.ts

router.post(
  "/",
  authenticateJWT,
  authorize(["Admin", "Reviewer", "Editor"]),
  fileOperationsLimiter,
  upload.single("file"),
  uploadFile
);

router.get(
  "/",
  authenticateJWT,
  fileOperationsLimiter,
  getAllFiles
);

router.get(
  "/:id",
  authenticateJWT,
  fileOperationsLimiter,
  downloadFile
);

router.delete(
  "/:id",
  authenticateJWT,
  authorize(["Admin", "Reviewer", "Editor"]),
  fileOperationsLimiter,
  deleteFile
);
```

### Endpoints

| Method | Endpoint | Purpose | Roles |
|--------|----------|---------|-------|
| POST | `/api/file-manager` | Upload file | Admin, Reviewer, Editor |
| GET | `/api/file-manager` | List all files | All authenticated |
| GET | `/api/file-manager/:id` | Download file | All authenticated (with access) |
| DELETE | `/api/file-manager/:id` | Delete file | Admin, Reviewer, Editor |
| GET | `/api/files/by-projid/:id` | Project files | All authenticated |

## Frontend Implementation

### Uppy Configuration

```typescript
// File: Clients/src/application/tools/createUppy.ts

import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";

export const createUppy = (options: UppyOptions = {}) => {
  const uppy = new Uppy({
    autoProceed: false,  // Manual upload trigger
    restrictions: {
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024,  // 10MB default
      maxNumberOfFiles: options.maxFiles || 5,
      allowedFileTypes: options.allowedFileTypes,
    },
  });

  uppy.use(XHRUpload, {
    endpoint: `${API_URL}/file-manager`,
    fieldName: "file",
    formData: true,
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  return uppy;
};
```

### File Upload Component

```typescript
// File: Clients/src/presentation/components/Modals/FileUpload/index.tsx

import { Dashboard } from "@uppy/react";
import "@uppy/core/dist/style.css";
import "@uppy/dashboard/dist/style.css";

const FileUploadModal = ({ open, onClose, onUploadComplete }) => {
  const uppy = useMemo(() => createUppy({
    maxFileSize: 30 * 1024 * 1024,
    allowedFileTypes: [".pdf", ".doc", ".docx", ".xls", ".xlsx"],
  }), []);

  useEffect(() => {
    uppy.on("complete", (result) => {
      onUploadComplete(result.successful);
    });

    return () => uppy.close();
  }, [uppy]);

  return (
    <Modal open={open} onClose={onClose}>
      <Dashboard
        uppy={uppy}
        proudlyDisplayPoweredByUppy={false}
        showProgressDetails
        hideUploadButton={false}
      />
    </Modal>
  );
};
```

### File Download

```typescript
// File: Clients/src/application/tools/fileDownload.ts

export const downloadFile = async (fileId: string, filename: string) => {
  try {
    const blob = await downloadFileFromManager({ id: fileId });

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download failed:", error);
    throw error;
  }
};
```

### File Repository (API Client)

```typescript
// File: Clients/src/application/repository/file.repository.ts

export const fileRepository = {
  // Upload file
  uploadFileToManager: async ({
    file,
    model_id,
    source,
    signal,
  }: UploadParams) => {
    const formData = new FormData();
    formData.append("file", file);
    if (model_id) formData.append("model_id", String(model_id));
    if (source) formData.append("source", source);

    const response = await api.post("/file-manager", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      signal,
    });
    return response.data;
  },

  // Download file
  downloadFileFromManager: async ({ id, signal }: DownloadParams) => {
    const response = await api.get(`/file-manager/${id}`, {
      responseType: "blob",
      signal,
    });
    return response.data;
  },

  // Delete file
  deleteFileFromManager: async ({ id, signal }: DeleteParams) => {
    const response = await api.delete(`/file-manager/${id}`, { signal });
    return response.data;
  },

  // Get user's files
  getUserFilesMetaData: async ({ signal }: { signal?: AbortSignal }) => {
    const response = await api.get("/files", { signal });
    return response.data;
  },
};
```

## File Access Logging

### Log File Access

```typescript
// File: Servers/repositories/file.repository.ts

export async function logFileAccess(
  fileId: number,
  userId: number,
  orgId: number,
  action: "download" | "view",
  tenant: string,
  transaction?: Transaction
): Promise<void> {
  validateTenant(tenant);

  const query = `
    INSERT INTO ${escapePgIdentifier(tenant)}.file_access_logs
      (file_id, accessed_by, access_date, action, org_id)
    VALUES
      (:fileId, :userId, NOW(), :action, :orgId)
  `;

  await sequelize.query(query, {
    replacements: { fileId, userId, action, orgId },
    transaction,
  });
}
```

### Retrieve Access Logs

```typescript
export async function getFileAccessLogs(
  fileId: number,
  tenant: string,
  options: { limit?: number; offset?: number } = {}
): Promise<FileAccessLog[]> {
  validateTenant(tenant);

  const { limit = 50, offset = 0 } = options;

  const query = `
    SELECT
      fal.*,
      u.name || ' ' || u.surname AS accessed_by_name
    FROM ${escapePgIdentifier(tenant)}.file_access_logs fal
    JOIN public.users u ON fal.accessed_by = u.id
    WHERE fal.file_id = :fileId
    ORDER BY fal.access_date DESC
    LIMIT :limit OFFSET :offset
  `;

  const [results] = await sequelize.query(query, {
    replacements: { fileId, limit, offset },
  });

  return results as FileAccessLog[];
}
```

## Security Features

### Input Validation

- **Filename Sanitization**: Uses `sanitize-filename` library
- **MIME Type Validation**: Checked against allowed types
- **File Size Limit**: 30MB maximum
- **SQL Injection Prevention**: Parameterized queries

### Authorization

- **JWT Authentication**: Required for all routes
- **Role-Based Access**: Auditors cannot upload/delete
- **File-Level Access**: Ownership and membership checks
- **Tenant Isolation**: Schema-per-tenant architecture

### Rate Limiting

```typescript
// File: Servers/middleware/rateLimit.middleware.ts

export const fileOperationsLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 50,              // 50 operations per minute
  message: { message: "Too many file operations" },
});
```

## Storage Considerations

### BLOB vs Filesystem

**Why BLOB Storage:**
- Transactional support (rollback on failures)
- Integrated with multi-tenancy
- Single backup mechanism (database)
- Query-based access control
- No filesystem permissions issues

**Trade-offs:**
- Database size grows with files
- No file deduplication
- Database I/O for every access

### File Size Recommendations

| Use Case | Recommended Max Size |
|----------|---------------------|
| Documents (PDF, DOC) | 30MB |
| Images | 10MB |
| Videos | Consider external storage |

## File Entity Links (Generic Linking)

The `file_entity_links` table provides a generic way to associate files with any entity (frameworks, plugins, controls, etc.) without modifying the core files table.

### Linking a File to an Entity

```typescript
// Link file to a framework control or plugin entity
await sequelize.query(`
  INSERT INTO "${tenantId}".file_entity_links
  (file_id, framework_type, entity_type, entity_id, project_id, created_by)
  VALUES (:fileId, :frameworkType, :entityType, :entityId, :projectId, :userId)
`, {
  replacements: {
    fileId,
    frameworkType: "eu-ai-act",  // or plugin key like "nyc-local-law-144"
    entityType: "control",        // or "level2", "assessment", etc.
    entityId,
    projectId,
    userId,
  },
  transaction
});
```

### Getting Files for an Entity

```typescript
const files = await sequelize.query(`
  SELECT f.* FROM "${tenantId}".files f
  INNER JOIN "${tenantId}".file_entity_links fel ON f.id = fel.file_id
  WHERE fel.framework_type = :frameworkType
    AND fel.entity_type = :entityType
    AND fel.entity_id = :entityId
`, { replacements: { frameworkType, entityType, entityId } });
```

### Unlinking a File

```typescript
await sequelize.query(`
  DELETE FROM "${tenantId}".file_entity_links
  WHERE file_id = :fileId
    AND framework_type = :frameworkType
    AND entity_type = :entityType
    AND entity_id = :entityId
`, { replacements: { fileId, frameworkType, entityType, entityId }, transaction });
```

This is particularly important for **plugin file associations** — see [Plugin System](./plugin-system.md#file-linking-for-plugins).

---

## Key Files

| File | Purpose |
|------|---------|
| `Servers/domain.layer/models/file/file.model.ts` | File model |
| `Servers/repositories/file.repository.ts` | Database operations |
| `Servers/controllers/fileManager.ctrl.ts` | Upload/download handlers |
| `Servers/routes/fileManager.route.ts` | API routes |
| `Servers/utils/validations/fileManagerValidation.utils.ts` | Validation |
| `Clients/src/application/repository/file.repository.ts` | API client |
| `Clients/src/application/tools/createUppy.ts` | Uppy factory |
| `Clients/src/application/tools/fileDownload.ts` | Download helper |

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [Database Schema](../architecture/database-schema.md)
- [API Endpoints](../api/endpoints.md)
