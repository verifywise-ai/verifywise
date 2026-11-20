# File Storage Migration Guide

VerifyWise abstracts file storage behind a provider interface (`Servers/services/storage/`).
This guide covers the two providers, how to configure them, how to switch between
them, and the backup/recovery implications of each.

## Providers

### `local` (default) — database storage

File bytes are stored in the `files.content` column (PostgreSQL `bytea`). This is
the historical behavior and remains the default, so **existing deployments need no
configuration change** and no data migration.

- Rows stored under this provider have `storage_provider` and `storage_key` set to
  NULL.
- Downloads are served through the existing authorized API endpoints; signed URLs
  are not supported (and not needed) for this provider.
- Multi-instance safe: any backend instance can serve any file, because the bytes
  live in the shared database.

### `s3` — S3-compatible object storage

File bytes are stored in an S3-compatible bucket (AWS S3, MinIO, Wasabi,
Cloudflare R2, etc.). The database row keeps all metadata and records the object
location in `storage_provider` / `storage_key`; `content` is NULL for these rows.

- Uploads, downloads, deletes, and signed URL generation go through the AWS SDK
  v3 against the configured endpoint.
- Signed URLs (presigned GET) can be generated server-side with a configurable TTL.
- Object keys are tenant-scoped and collision-free:
  `{S3_KEY_PREFIX}org-{organizationId}/{uuid}-{sanitized-filename}`.

## Configuration

Provider selection is driven by one environment variable:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `STORAGE_PROVIDER` | `local` or `s3` | `local` | No |

When `STORAGE_PROVIDER=s3`, the following apply:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `S3_BUCKET` | Target bucket | — | **Yes** |
| `S3_ENDPOINT` | Custom endpoint URL (MinIO, Wasabi, R2…). Omit for AWS S3 | (AWS) | No |
| `S3_REGION` | Bucket/signing region | `us-east-1` | No |
| `S3_ACCESS_KEY_ID` | Static access key | — | No* |
| `S3_SECRET_ACCESS_KEY` | Static secret key | — | No* |
| `S3_FORCE_PATH_STYLE` | `true`/`false`. Path-style addressing is required by most S3-compatible providers | `true` when `S3_ENDPOINT` is set, else `false` | No |
| `S3_KEY_PREFIX` | Key prefix for all objects | `files/` | No |
| `S3_SIGNED_URL_TTL_SECONDS` | Presigned URL lifetime (positive integer) | `900` | No |

\* `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` must be set **together**, or both
left unset to use the default AWS credential chain (instance role, `~/.aws`,
environment credentials, etc.).

Example — MinIO:

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=verifywise-files
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=change-me
```

Example — AWS S3 with an instance role:

```bash
STORAGE_PROVIDER=s3
S3_BUCKET=verifywise-files
S3_REGION=eu-west-1
```

Invalid or incomplete configuration fails fast with a `StorageConfigError` naming
the offending variable. Credentials are never written to logs.

## Switching providers

**Existing files are never stranded by a switch.** Reads resolve bytes using the
provider recorded on each row (`storage_provider` / `storage_key`), not the global
configuration, so a mixed dataset keeps working:

- `local` → `s3`: rows with bytes in `content` keep downloading from the database;
  new uploads go to the bucket.
- `s3` → `local`: rows with a `storage_key` keep downloading from the bucket (the
  S3 configuration must remain valid for those reads); new uploads go to the
  database.

There is no built-in re-key/migration tool. If you want a uniform backend after
switching, re-upload the affected files through the API, or script a copy using the
same storage interface, then update the rows accordingly. Until you do, both
backends must stay reachable.

## Backup and recovery

### `local` (database)

File bytes are part of the PostgreSQL database, so they are covered by your
existing database backups (pg_dump, base backups, PITR). No separate file backup
is needed — see the [Disaster Recovery Guide](./DISASTER_RECOVERY_GUIDE.md).

### `s3`

The database no longer contains the bytes, so back up both:

- **Database** — unchanged; it holds metadata and object keys.
- **Bucket** — enable **bucket versioning** so deletes and overwrites are
  recoverable, and add **lifecycle policies** for old versions (e.g. expire
  non-current versions after N days) and, where appropriate, storage-class
  transitions. For DR, replicate to a second bucket/region (S3 replication or
  provider equivalent) or schedule periodic syncs (`aws s3 sync`, `rclone`).

Recovery of a deleted file requires both the row (from a database backup) and the
object version (from the bucket); keep their retention windows aligned.

## Running multiple backend instances

- `local`: already safe — bytes are in the shared database, so any replica serves
  any file (see [multi-replica-scaling.md](./multi-replica-scaling.md)).
- `s3`: safe for the same reason — all instances share one bucket. Object deletes
  are deferred until the surrounding database transaction commits, so a rollback
  never removes an object a live row still references; failed post-commit deletes
  are logged and leave a harmless orphan object. Reap orphans with a bucket
  lifecycle rule or a periodic sweep of keys not referenced by any `files` row.

## Schema change

Migration `20261117000000-add-file-storage-provider-columns.js` adds two nullable
columns to `files` (`storage_provider VARCHAR(20)`, `storage_key VARCHAR(1024)`).
It is additive only: no backfill, no data movement, fully reversible
(`db:migrate:undo`). All existing rows keep NULL in both columns and behave
exactly as before.
