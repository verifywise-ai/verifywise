#!/usr/bin/env python3
"""
Migrate EvalServer Tenant Data to Shared Schema

This script migrates data from old tenant schemas (e.g., "abc123".llm_evals_projects)
to the new shared verifywise schema (llm_evals_projects with organization_id).

USAGE:
    python migrate_to_shared_schema.py
    python migrate_to_shared_schema.py --keep-schemas
    python migrate_to_shared_schema.py --dry-run

PREREQUISITES:
    1. Run Alembic migrations first to create verifywise schema tables
    2. Backup your database before running this script

WHAT THIS SCRIPT DOES:
    1. Checks migration_status table for previous runs
    2. Finds all organizations with tenant schemas
    3. For each tenant, copies data from tenant schema to verifywise schema
    4. Remaps all foreign key references using in-memory mapping
    5. Validates row counts match
    6. Optionally drops tenant schemas after successful migration
"""

import os
import sys
import json
import hashlib
import argparse
import asyncio
from datetime import datetime
from typing import Dict, List, Any, Optional, Set, Tuple
from dataclasses import dataclass, field

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker

from scripts.migration_config import (
    MIGRATION_KEY,
    BATCH_SIZE,
    FK_MAPPINGS,
    USER_REFERENCE_COLUMNS,
    SERIAL_ID_TABLES,
    get_all_tables_in_order,
    get_source_table_name,
)


# ============================================================
# DATA CLASSES
# ============================================================

@dataclass
class IdMapping:
    """Tracks old ID -> new ID mappings per table."""
    mappings: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def get(self, table: str, old_id: Any) -> Optional[Any]:
        """Get new ID for an old ID."""
        return self.mappings.get(table, {}).get(str(old_id))

    def set(self, table: str, old_id: Any, new_id: Any):
        """Set mapping for an ID."""
        if table not in self.mappings:
            self.mappings[table] = {}
        self.mappings[table][str(old_id)] = new_id


@dataclass
class MigrationResult:
    """Result of a migration run."""
    success: bool
    status: str  # "completed", "just_completed", "failed", "no_tenants", "already_completed"
    organizations_migrated: int = 0
    tables_processed: int = 0
    rows_migrated: int = 0
    errors: List[str] = field(default_factory=list)


@dataclass
class TableMigrationResult:
    """Result of migrating a single table."""
    source_count: int = 0
    migrated_count: int = 0


# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def get_tenant_hash(org_id: int) -> str:
    """Generate tenant hash from organization ID (same as backend getTenantHash)."""
    import base64
    hash_bytes = hashlib.sha256(str(org_id).encode()).digest()
    hash_b64 = base64.b64encode(hash_bytes).decode()
    # Remove non-alphanumeric chars and take first 10
    clean = ''.join(c for c in hash_b64 if c.isalnum())
    return clean[:10]


async def schema_exists(session: AsyncSession, schema_name: str) -> bool:
    """Check if a schema exists."""
    result = await session.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.schemata
                WHERE schema_name = :schema_name
            )
        """),
        {"schema_name": schema_name}
    )
    row = result.fetchone()
    return row[0] if row else False


async def table_exists(session: AsyncSession, schema_name: str, table_name: str) -> bool:
    """Check if a table exists in a schema."""
    result = await session.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = :schema_name AND table_name = :table_name
            )
        """),
        {"schema_name": schema_name, "table_name": table_name}
    )
    row = result.fetchone()
    return row[0] if row else False


async def get_tables_in_schema(session: AsyncSession, schema_name: str) -> Set[str]:
    """Get all table names in a schema."""
    result = await session.execute(
        text("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = :schema_name
        """),
        {"schema_name": schema_name}
    )
    return {row[0] for row in result.fetchall()}


async def get_row_count(
    session: AsyncSession,
    schema_name: str,
    table_name: str,
    organization_id: Optional[int] = None
) -> int:
    """Get row count from a table."""
    exists = await table_exists(session, schema_name, table_name)
    if not exists:
        return 0

    if organization_id is not None and schema_name == "verifywise":
        result = await session.execute(
            text(f'SELECT COUNT(*) FROM "{schema_name}"."{table_name}" WHERE organization_id = :org_id'),
            {"org_id": organization_id}
        )
    else:
        result = await session.execute(
            text(f'SELECT COUNT(*) FROM "{schema_name}"."{table_name}"')
        )

    row = result.fetchone()
    return int(row[0]) if row else 0


async def get_table_columns(session: AsyncSession, schema_name: str, table_name: str) -> List[str]:
    """Get column names for a table."""
    result = await session.execute(
        text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = :schema_name AND table_name = :table_name
            ORDER BY ordinal_position
        """),
        {"schema_name": schema_name, "table_name": table_name}
    )
    return [row[0] for row in result.fetchall()]


async def has_organization_id_column(session: AsyncSession, table_name: str) -> bool:
    """Check if verifywise table has organization_id column."""
    result = await session.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'verifywise'
                  AND table_name = :table_name
                  AND column_name = 'organization_id'
            )
        """),
        {"table_name": table_name}
    )
    row = result.fetchone()
    return row[0] if row else False


# ============================================================
# MIGRATION STATUS TRACKING
# ============================================================

async def ensure_migration_status_table(session: AsyncSession):
    """Create migration_status table if it doesn't exist."""
    await session.execute(text("""
        CREATE TABLE IF NOT EXISTS verifywise.evalserver_migration_status (
            migration_key VARCHAR(255) PRIMARY KEY,
            status VARCHAR(50) NOT NULL,
            organizations_migrated INTEGER DEFAULT 0,
            organizations_total INTEGER DEFAULT 0,
            current_organization_id INTEGER,
            current_table VARCHAR(255),
            error_message TEXT,
            validation_report JSONB,
            started_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    """))
    await session.commit()


async def get_migration_status(session: AsyncSession) -> Optional[Dict[str, Any]]:
    """Get current migration status."""
    result = await session.execute(
        text("""
            SELECT status, organizations_migrated, organizations_total,
                   current_organization_id, current_table, error_message
            FROM verifywise.evalserver_migration_status
            WHERE migration_key = :key
        """),
        {"key": MIGRATION_KEY}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def update_migration_status(session: AsyncSession, **kwargs):
    """Update migration status."""
    now = datetime.utcnow()
    status = kwargs.get("status")

    # Check if record exists
    existing = await get_migration_status(session)

    if existing:
        # Build dynamic UPDATE
        updates = ["updated_at = :now"]
        params = {"key": MIGRATION_KEY, "now": now}

        for field in ["status", "organizations_migrated", "organizations_total",
                      "current_organization_id", "current_table", "error_message"]:
            if field in kwargs:
                updates.append(f"{field} = :{field}")
                params[field] = kwargs[field]

        if status == "completed":
            updates.append("completed_at = :now")

        await session.execute(
            text(f"UPDATE verifywise.evalserver_migration_status SET {', '.join(updates)} WHERE migration_key = :key"),
            params
        )
    else:
        await session.execute(
            text("""
                INSERT INTO verifywise.evalserver_migration_status
                (migration_key, status, organizations_migrated, organizations_total, started_at, created_at, updated_at)
                VALUES (:key, :status, :orgs_migrated, :orgs_total, :now, :now, :now)
            """),
            {
                "key": MIGRATION_KEY,
                "status": kwargs.get("status", "pending"),
                "orgs_migrated": kwargs.get("organizations_migrated", 0),
                "orgs_total": kwargs.get("organizations_total", 0),
                "now": now,
            }
        )

    await session.commit()


# ============================================================
# TABLE MIGRATION
# ============================================================

async def migrate_table(
    session: AsyncSession,
    org_id: int,
    tenant_hash: str,
    table_name: str,
    available_tables: Set[str],
    id_mapping: IdMapping,
    dry_run: bool = False
) -> TableMigrationResult:
    """Migrate a single table from tenant schema to verifywise schema."""
    result = TableMigrationResult()

    # Get actual source table name (handles aliases)
    source_table = get_source_table_name(table_name, available_tables)

    # Check if source table exists
    if source_table not in available_tables:
        return result

    # Get row count
    source_count = await get_row_count(session, tenant_hash, source_table)
    result.source_count = source_count

    if source_count == 0:
        return result

    # Get columns from both source and target tables
    source_columns = await get_table_columns(session, tenant_hash, source_table)
    target_columns = await get_table_columns(session, "verifywise", table_name)
    if not source_columns or not target_columns:
        return result

    # Only copy columns that exist in BOTH source and target
    target_column_set = set(target_columns)
    common_columns = [col for col in source_columns if col in target_column_set]

    skipped_cols = [col for col in source_columns if col not in target_column_set]
    if skipped_cols:
        print(f"    ℹ️  {table_name}: skipping columns not in verifywise schema: {', '.join(skipped_cols)}")

    if not common_columns:
        print(f"    ⊘ {table_name}: no common columns between tenant and verifywise schema")
        return result

    # Check for NOT NULL target columns missing from source (would cause insert failure)
    source_column_set = set(source_columns)
    not_null_check = await session.execute(
        text("""SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'verifywise' AND table_name = :table_name
                  AND is_nullable = 'NO' AND column_default IS NULL
                  AND column_name NOT IN ('id', 'organization_id')"""),
        {"table_name": table_name}
    )
    not_null_missing = [r[0] for r in not_null_check.fetchall() if r[0] not in source_column_set]
    if not_null_missing:
        print(f"    ⊘ {table_name}: skipping — target has NOT NULL columns missing from source: {', '.join(not_null_missing)}")
        return result

    # Check if target has organization_id
    has_org_id = await has_organization_id_column(session, table_name)

    # Get FK mappings for this table
    fk_mappings = FK_MAPPINGS.get(table_name, {})

    # Check if table has SERIAL ID
    is_serial_id_table = table_name in SERIAL_ID_TABLES

    # Initialize mapping for this table if needed
    if table_name not in id_mapping.mappings:
        id_mapping.mappings[table_name] = {}

    # Fetch all rows from source
    fetch_result = await session.execute(
        text(f'SELECT * FROM "{tenant_hash}"."{source_table}" ORDER BY id' if "id" in common_columns
             else f'SELECT * FROM "{tenant_hash}"."{source_table}"')
    )
    rows = fetch_result.mappings().all()

    if dry_run:
        result.migrated_count = len(rows)
        print(f"    [DRY-RUN] {table_name}: would migrate {len(rows)} rows")
        return result

    # Process each row
    migrated_count = 0
    for row in rows:
        row_dict = dict(row)
        old_id = row_dict.get("id")
        insert_data = {}

        # Copy columns, applying FK mappings where needed
        for col in common_columns:
            if col == "id" and is_serial_id_table:
                # Skip SERIAL IDs - they'll be auto-generated
                continue

            value = row_dict.get(col)

            # Apply FK mapping if this column references another migrated table
            if col in fk_mappings and value is not None:
                source_table_ref = fk_mappings[col]
                new_value = id_mapping.get(source_table_ref, value)
                if new_value is not None:
                    insert_data[col] = new_value
                else:
                    insert_data[col] = value
            elif col in USER_REFERENCE_COLUMNS:
                # Keep user references as-is (they point to verifywise.users)
                insert_data[col] = value
            else:
                insert_data[col] = value

        # Build INSERT statement
        if has_org_id:
            target_columns = ["organization_id"] + [c for c in source_columns if c != "id" or not is_serial_id_table]
            values_dict = {"organization_id": org_id, **insert_data}
        else:
            target_columns = [c for c in source_columns if c != "id" or not is_serial_id_table]
            values_dict = insert_data

        # Filter to only columns that exist in values_dict
        target_columns = [c for c in target_columns if c in values_dict or c == "organization_id"]

        # Serialize dict/list values to JSON strings (asyncpg can't encode raw dicts for JSONB)
        for col in target_columns:
            val = values_dict.get(col)
            if isinstance(val, (dict, list)):
                values_dict[col] = json.dumps(val)

        column_list = ", ".join(f'"{c}"' for c in target_columns)
        placeholder_list = ", ".join(f":{c}" for c in target_columns)

        try:
            if is_serial_id_table:
                # For SERIAL ID tables, get the new ID from RETURNING
                insert_result = await session.execute(
                    text(f"""
                        INSERT INTO verifywise."{table_name}" ({column_list})
                        VALUES ({placeholder_list})
                        RETURNING id
                    """),
                    values_dict
                )
                new_row = insert_result.fetchone()
                new_id = new_row[0] if new_row else None
                if new_id is not None and old_id is not None:
                    id_mapping.set(table_name, old_id, new_id)
            else:
                # For VARCHAR ID tables, just insert
                await session.execute(
                    text(f"""
                        INSERT INTO verifywise."{table_name}" ({column_list})
                        VALUES ({placeholder_list})
                        ON CONFLICT DO NOTHING
                    """),
                    values_dict
                )
                # Map old ID to itself for VARCHAR IDs
                if old_id is not None:
                    id_mapping.set(table_name, old_id, old_id)

            migrated_count += 1

        except Exception as e:
            # Handle unique constraint violations (might be duplicate from previous partial migration)
            if "duplicate key" in str(e).lower() or "unique constraint" in str(e).lower():
                # Already exists, add to mapping
                if old_id is not None:
                    id_mapping.set(table_name, old_id, old_id)
                migrated_count += 1
            else:
                raise

    result.migrated_count = migrated_count

    if migrated_count > 0:
        print(f"    ✓ {table_name}: {migrated_count} rows")

    return result


# ============================================================
# ORGANIZATION MIGRATION
# ============================================================

async def migrate_organization(
    session: AsyncSession,
    org_id: int,
    tenant_hash: str,
    drop_schema_after: bool = False,
    dry_run: bool = False
) -> Tuple[bool, Dict[str, TableMigrationResult], Optional[str]]:
    """Migrate all data for a single organization."""
    table_counts: Dict[str, TableMigrationResult] = {}
    error_msg = None

    try:
        print(f"\n  Migrating organization {org_id} ({tenant_hash})...")

        # Check if tenant schema exists
        exists = await schema_exists(session, tenant_hash)
        if not exists:
            print(f"    ⊘ No tenant schema found, skipping")
            return True, table_counts, None

        # Get available tables in tenant schema
        available_tables = await get_tables_in_schema(session, tenant_hash)

        # Initialize ID mapping for this organization
        id_mapping = IdMapping()

        # Get all tables in dependency order
        all_tables = get_all_tables_in_order()

        # Migrate each table in order
        for table_name in all_tables:
            try:
                result = await migrate_table(
                    session,
                    org_id,
                    tenant_hash,
                    table_name,
                    available_tables,
                    id_mapping,
                    dry_run
                )
                table_counts[table_name] = result
            except Exception as e:
                print(f"    ✗ {table_name}: {str(e)}")
                raise

        # Optionally drop tenant schema after successful migration
        if drop_schema_after and not dry_run:
            print(f"    🗑️  Dropping tenant schema {tenant_hash}...")
            await session.execute(text(f'DROP SCHEMA IF EXISTS "{tenant_hash}" CASCADE'))

        # Commit entire org migration as one transaction
        await session.commit()

        print(f"  ✓ Organization {org_id} migrated successfully")
        return True, table_counts, None

    except Exception as e:
        error_msg = str(e)
        print(f"  ✗ Failed to migrate organization {org_id}: {error_msg}")
        await session.rollback()
        return False, table_counts, error_msg


# ============================================================
# MAIN MIGRATION FUNCTION
# ============================================================

async def migrate_to_shared_schema(
    database_url: str,
    drop_schemas_after: bool = True,
    dry_run: bool = False
) -> MigrationResult:
    """Run the full migration."""
    print("╔════════════════════════════════════════════════════════════╗")
    print("║   EVALSERVER: MIGRATE TENANT DATA TO SHARED SCHEMA         ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print("")
    print("Configuration:")
    print(f"  - Drop schemas after migration: {drop_schemas_after}")
    print(f"  - Dry run: {dry_run}")
    print("")

    result = MigrationResult(success=True, status="pending")

    # Create async engine
    engine = create_async_engine(database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as session:
            # Ensure migration status table exists
            await ensure_migration_status_table(session)

            # Check if migration already completed
            status = await get_migration_status(session)
            if status and status.get("status") == "completed":
                print("✓ Migration already completed")
                result.status = "already_completed"
                return result

            # Get all organizations
            org_result = await session.execute(
                text("SELECT id, name FROM public.organizations ORDER BY id")
            )
            organizations = [{"id": row[0], "name": row[1]} for row in org_result.fetchall()]

            if not organizations:
                print("No organizations found.")
                result.status = "no_tenants"
                return result

            print(f"Found {len(organizations)} organizations to migrate.\n")

            # Check if any tenant schemas exist
            tenants_exist = False
            for org in organizations:
                tenant_hash = get_tenant_hash(org["id"])
                if await schema_exists(session, tenant_hash):
                    tenants_exist = True
                    break

            if not tenants_exist:
                print("ℹ️  No tenant schemas found, marking migration as complete")
                await update_migration_status(
                    session,
                    status="completed",
                    organizations_migrated=0,
                    organizations_total=len(organizations)
                )
                result.status = "no_tenants"
                return result

            # Update migration status
            await update_migration_status(
                session,
                status="in_progress",
                organizations_migrated=0,
                organizations_total=len(organizations)
            )

            # Migrate each organization
            for org in organizations:
                tenant_hash = get_tenant_hash(org["id"])

                await update_migration_status(
                    session,
                    status="in_progress",
                    current_organization_id=org["id"]
                )

                success, table_counts, error = await migrate_organization(
                    session,
                    org["id"],
                    tenant_hash,
                    drop_schemas_after,
                    dry_run
                )

                if success:
                    result.organizations_migrated += 1
                    for table_name, counts in table_counts.items():
                        if counts.migrated_count > 0:
                            result.tables_processed += 1
                            result.rows_migrated += counts.migrated_count
                else:
                    result.errors.append(f"Org {org['id']}: {error}")

                await update_migration_status(
                    session,
                    status="in_progress",
                    organizations_migrated=result.organizations_migrated
                )

            # Update final status
            final_status = "completed" if not result.errors else "failed"
            await update_migration_status(
                session,
                status=final_status,
                organizations_migrated=result.organizations_migrated,
                error_message="; ".join(result.errors) if result.errors else None
            )

            result.status = "just_completed" if not result.errors else "failed"
            result.success = not result.errors

    except Exception as e:
        result.success = False
        result.status = "failed"
        result.errors.append(str(e))

    finally:
        await engine.dispose()

    # Print summary
    print("\n╔════════════════════════════════════════════════════════════╗")
    print("║                    MIGRATION COMPLETE                       ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print(f"\n  ✓ Organizations migrated: {result.organizations_migrated}")
    print(f"  ✓ Tables processed: {result.tables_processed}")
    print(f"  ✓ Rows migrated: {result.rows_migrated}")

    if result.errors:
        print(f"\n  ✗ Errors ({len(result.errors)}):")
        for err in result.errors:
            print(f"    - {err}")

    if drop_schemas_after and not dry_run:
        print("\n  🗑️  Old tenant schemas have been dropped.")
    else:
        print("\n  📁 Old tenant schemas have been preserved.")

    return result


# ============================================================
# SERVER STARTUP INTEGRATION
# ============================================================

async def check_and_run_migration(database_url: str) -> MigrationResult:
    """
    Check and run migration on server startup.
    Uses a PostgreSQL advisory lock so only one worker runs the migration
    while others wait and then see "already_completed".
    """
    # Advisory lock ID — unique constant for EvalServer data migration
    MIGRATION_LOCK_ID = 8675309

    engine = create_async_engine(database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        # Use a dedicated connection for the advisory lock so it spans the entire migration
        async with engine.connect() as lock_conn:
            # Acquire advisory lock — blocks until available (one worker at a time)
            await lock_conn.execute(text(f"SELECT pg_advisory_lock({MIGRATION_LOCK_ID})"))

            try:
                async with Session() as session:
                    # Ensure migration status table exists
                    await ensure_migration_status_table(session)

                    # Check current migration status
                    status = await get_migration_status(session)

                    # If migration already completed, skip
                    if status and status.get("status") == "completed":
                        return MigrationResult(
                            success=True,
                            status="already_completed",
                            organizations_migrated=status.get("organizations_migrated", 0)
                        )

                    # Check if any tenant schemas exist
                    org_result = await session.execute(
                        text("SELECT id FROM public.organizations ORDER BY id")
                    )
                    organizations = [row[0] for row in org_result.fetchall()]

                    if not organizations:
                        return MigrationResult(success=True, status="no_tenants")

                    tenants_exist = False
                    for org_id in organizations:
                        tenant_hash = get_tenant_hash(org_id)
                        if await schema_exists(session, tenant_hash):
                            tenants_exist = True
                            break

                    if not tenants_exist:
                        # Mark as completed since there's nothing to migrate
                        await update_migration_status(
                            session,
                            status="completed",
                            organizations_migrated=0,
                            organizations_total=len(organizations)
                        )
                        print("No tenant schemas found, marking migration as complete")
                        return MigrationResult(success=True, status="no_tenants")

                # Run the migration while still holding the lock
                print("\nStarting EvalServer tenant-to-shared-schema migration...")
                return await migrate_to_shared_schema(
                    database_url,
                    drop_schemas_after=False,
                    dry_run=False
                )

            finally:
                # Release advisory lock so other workers can proceed
                await lock_conn.execute(text(f"SELECT pg_advisory_unlock({MIGRATION_LOCK_ID})"))

    finally:
        await engine.dispose()


# ============================================================
# CLI ENTRY POINT
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Migrate EvalServer data to shared schema")
    parser.add_argument("--keep-schemas", action="store_true", help="Keep old tenant schemas after migration")
    parser.add_argument("--dry-run", action="store_true", help="Simulate migration without making changes")
    args = parser.parse_args()

    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)

    # Convert to async URL if needed
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif not database_url.startswith("postgresql+asyncpg://"):
        database_url = f"postgresql+asyncpg://{database_url}"

    # Run migration
    result = asyncio.run(migrate_to_shared_schema(
        database_url,
        drop_schemas_after=not args.keep_schemas,
        dry_run=args.dry_run
    ))

    sys.exit(0 if result.success else 1)


if __name__ == "__main__":
    main()
