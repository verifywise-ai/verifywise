import json
import re
from datetime import datetime
from typing import Any, Optional

from database.db import get_db
from sqlalchemy import text


def extract_variables(messages: list) -> list:
    """Find all {{varName}} patterns in messages and return unique list."""
    pattern = r'\{\{(\w+)\}\}'
    found = set()
    for message in messages:
        content = message.get("content", "") if isinstance(message, dict) else str(message)
        matches = re.findall(pattern, content)
        found.update(matches)
    return list(found)


def resolve_variables(messages: list, values: dict) -> list:
    """Replace {{varName}} with provided values, keep unresolved as-is."""
    pattern = r'\{\{(\w+)\}\}'
    resolved = []
    for message in messages:
        if isinstance(message, dict):
            msg = dict(message)
            content = msg.get("content", "")
            def replacer(m):
                key = m.group(1)
                return str(values[key]) if key in values else m.group(0)
            msg["content"] = re.sub(pattern, replacer, content)
            resolved.append(msg)
        else:
            def replacer(m):
                key = m.group(1)
                return str(values[key]) if key in values else m.group(0)
            resolved.append(re.sub(pattern, replacer, str(message)))
    return resolved


async def create_prompt(
    org_id: int,
    slug: str,
    name: str,
    description: Optional[str] = None,
    created_by: Optional[int] = None,
) -> dict:
    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_prompts
                    (organization_id, slug, name, description, created_by, created_at, updated_at)
                VALUES
                    (:org_id, :slug, :name, :description, :created_by, NOW(), NOW())
                RETURNING *
            """),
            {
                "org_id": org_id,
                "slug": slug,
                "name": name,
                "description": description,
                "created_by": created_by,
            },
        )
        await db.commit()
        row = result.mappings().fetchone()
        return dict(row) if row else {}


async def get_all_prompts(org_id: int) -> list:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    p.*,
                    pv.id            AS published_version_id,
                    pv.version       AS published_version_number,
                    pv.model         AS published_model,
                    pv.config        AS published_config,
                    pv.published_at,
                    (
                        SELECT COUNT(*)
                        FROM ai_gateway_prompt_versions v2
                        WHERE v2.prompt_id = p.id
                    ) AS version_count
                FROM ai_gateway_prompts p
                LEFT JOIN ai_gateway_prompt_versions pv
                    ON pv.prompt_id = p.id AND pv.status = 'published'
                WHERE p.organization_id = :org_id
                ORDER BY p.updated_at DESC
            """),
            {"org_id": org_id},
        )
        rows = result.mappings().fetchall()
        return [dict(r) for r in rows]


async def get_prompt_by_id(org_id: int, id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    p.*,
                    pv.id            AS published_version_id,
                    pv.version       AS published_version_number,
                    pv.model         AS published_model,
                    pv.config        AS published_config,
                    pv.published_at,
                    (
                        SELECT COUNT(*)
                        FROM ai_gateway_prompt_versions v2
                        WHERE v2.prompt_id = p.id
                    ) AS version_count
                FROM ai_gateway_prompts p
                LEFT JOIN ai_gateway_prompt_versions pv
                    ON pv.prompt_id = p.id AND pv.status = 'published'
                WHERE p.organization_id = :org_id AND p.id = :id
            """),
            {"org_id": org_id, "id": id},
        )
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def get_prompt_by_slug(org_id: int, slug: str) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT *
                FROM ai_gateway_prompts
                WHERE organization_id = :org_id AND slug = :slug
            """),
            {"org_id": org_id, "slug": slug},
        )
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def update_prompt(org_id: int, id: int, data: dict) -> Optional[dict]:
    allowed = {"name", "description"}
    set_clauses = []
    params: dict[str, Any] = {"org_id": org_id, "id": id}

    for key in allowed:
        if key in data:
            set_clauses.append(f"{key} = :{key}")
            params[key] = data[key]

    if not set_clauses:
        return await get_prompt_by_id(org_id, id)

    set_clauses.append("updated_at = NOW()")
    set_sql = ", ".join(set_clauses)

    async with get_db() as db:
        result = await db.execute(
            text(f"""
                UPDATE ai_gateway_prompts
                SET {set_sql}
                WHERE organization_id = :org_id AND id = :id
                RETURNING *
            """),
            params,
        )
        await db.commit()
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def delete_prompt(org_id: int, id: int) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_prompts
                WHERE organization_id = :org_id AND id = :id
                RETURNING id
            """),
            {"org_id": org_id, "id": id},
        )
        await db.commit()
        row = result.fetchone()
        return row is not None


async def create_version(
    org_id: int,
    prompt_id: int,
    content: list,
    model: Optional[str] = None,
    config: Optional[dict] = None,
    created_by: Optional[int] = None,
    commit_message: Optional[str] = None,
) -> Optional[dict]:
    variables = extract_variables(content)
    content_json = json.dumps(content)
    variables_json = json.dumps(variables)
    config_json = json.dumps(config) if config is not None else None

    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_prompt_versions
                    (organization_id, prompt_id, version, content, variables, model, config,
                     commit_message, created_by, status, created_at)
                VALUES (
                    :org_id,
                    :prompt_id,
                    COALESCE(
                        (SELECT MAX(version) FROM ai_gateway_prompt_versions WHERE prompt_id = :prompt_id),
                        0
                    ) + 1,
                    CAST(:content AS jsonb),
                    CAST(:variables AS jsonb),
                    :model,
                    CAST(:config AS jsonb),
                    :commit_message,
                    :created_by,
                    'draft',
                    NOW()
                )
                RETURNING *
            """),
            {
                "org_id": org_id,
                "prompt_id": prompt_id,
                "content": content_json,
                "variables": variables_json,
                "model": model,
                "config": config_json,
                "commit_message": commit_message,
                "created_by": created_by,
            },
        )
        await db.execute(
            text("""
                UPDATE ai_gateway_prompts
                SET updated_at = NOW()
                WHERE id = :prompt_id AND organization_id = :org_id
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        await db.commit()
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def get_versions(org_id: int, prompt_id: int) -> list:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    pv.*,
                    u1.email AS created_by_name,
                    u2.email AS published_by_name
                FROM ai_gateway_prompt_versions pv
                LEFT JOIN users u1 ON u1.id = pv.created_by
                LEFT JOIN users u2 ON u2.id = pv.published_by
                WHERE pv.prompt_id = :prompt_id
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
                ORDER BY pv.version DESC
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        rows = result.mappings().fetchall()
        return [dict(r) for r in rows]


async def get_published_version(org_id: int, prompt_id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT pv.*
                FROM ai_gateway_prompt_versions pv
                JOIN ai_gateway_prompts p ON p.id = pv.prompt_id
                WHERE pv.prompt_id = :prompt_id
                  AND p.organization_id = :org_id
                  AND pv.status = 'published'
                LIMIT 1
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def publish_version(
    org_id: int,
    prompt_id: int,
    version_number: int,
    published_by: int,
) -> Optional[dict]:
    async with get_db() as db:
        # Unpublish all versions for this prompt
        await db.execute(
            text("""
                UPDATE ai_gateway_prompt_versions
                SET status = 'draft', published_at = NULL, published_by = NULL
                WHERE prompt_id = :prompt_id
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )

        # Publish the target version
        result = await db.execute(
            text("""
                UPDATE ai_gateway_prompt_versions
                SET status = 'published',
                    published_at = NOW(),
                    published_by = :published_by
                WHERE prompt_id = :prompt_id AND version = :version_number
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
                RETURNING *
            """),
            {
                "prompt_id": prompt_id,
                "version_number": version_number,
                "published_by": published_by,
                "org_id": org_id,
            },
        )
        row = result.mappings().fetchone()

        if row is None:
            await db.rollback()
            return None

        # Touch parent prompt
        await db.execute(
            text("""
                UPDATE ai_gateway_prompts
                SET updated_at = NOW()
                WHERE id = :prompt_id AND organization_id = :org_id
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        await db.commit()
        return dict(row)


async def resolve_prompt(org_id: int, prompt_id: int) -> Optional[dict]:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT pv.content, pv.variables, pv.model, pv.config
                FROM ai_gateway_prompt_versions pv
                JOIN ai_gateway_prompts p ON p.id = pv.prompt_id
                WHERE pv.prompt_id = :prompt_id
                  AND p.organization_id = :org_id
                  AND pv.status = 'published'
                LIMIT 1
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def get_labels(org_id: int, prompt_id: int) -> list:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT
                    pl.*,
                    pv.version AS version_number,
                    u.email    AS assigned_by_name
                FROM ai_gateway_prompt_labels pl
                JOIN ai_gateway_prompt_versions pv ON pv.id = pl.version_id
                LEFT JOIN users u ON u.id = pl.assigned_by
                WHERE pl.prompt_id = :prompt_id
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
                ORDER BY pl.label_name
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        rows = result.mappings().fetchall()
        return [dict(r) for r in rows]


async def assign_label(
    org_id: int,
    prompt_id: int,
    label_name: str,
    version_id: int,
    assigned_by: Optional[int] = None,
) -> dict:
    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_prompt_labels
                    (organization_id, prompt_id, label_name, version_id, assigned_by, assigned_at)
                VALUES
                    (:org_id, :prompt_id, :label_name, :version_id, :assigned_by, NOW())
                ON CONFLICT (prompt_id, label_name)
                DO UPDATE SET
                    version_id  = EXCLUDED.version_id,
                    assigned_by = EXCLUDED.assigned_by,
                    assigned_at = NOW()
                RETURNING *
            """),
            {
                "org_id": org_id,
                "prompt_id": prompt_id,
                "label_name": label_name,
                "version_id": version_id,
                "assigned_by": assigned_by,
            },
        )
        await db.commit()
        row = result.mappings().fetchone()
        return dict(row) if row else {}


async def remove_label(org_id: int, prompt_id: int, label_name: str) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_prompt_labels
                WHERE prompt_id = :prompt_id AND label_name = :label_name
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
                RETURNING id
            """),
            {"prompt_id": prompt_id, "label_name": label_name, "org_id": org_id},
        )
        await db.commit()
        row = result.fetchone()
        return row is not None


async def resolve_prompt_by_label(
    org_id: int,
    prompt_id: int,
    label: str,
) -> Optional[dict]:
    async with get_db() as db:
        # Try label first
        result = await db.execute(
            text("""
                SELECT pv.content, pv.variables, pv.model, pv.config, pv.version
                FROM ai_gateway_prompt_labels pl
                JOIN ai_gateway_prompt_versions pv ON pv.id = pl.version_id
                JOIN ai_gateway_prompts p ON p.id = pv.prompt_id
                WHERE pl.prompt_id = :prompt_id
                  AND pl.label_name = :label
                  AND p.organization_id = :org_id
                LIMIT 1
            """),
            {"prompt_id": prompt_id, "label": label, "org_id": org_id},
        )
        row = result.mappings().fetchone()
        if row:
            return dict(row)

        # Fallback to published version
        result = await db.execute(
            text("""
                SELECT pv.content, pv.variables, pv.model, pv.config, pv.version
                FROM ai_gateway_prompt_versions pv
                JOIN ai_gateway_prompts p ON p.id = pv.prompt_id
                WHERE pv.prompt_id = :prompt_id
                  AND p.organization_id = :org_id
                  AND pv.status = 'published'
                LIMIT 1
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def create_test_dataset(
    org_id: int,
    prompt_id: int,
    name: str,
    test_cases: Optional[list] = None,
    created_by: Optional[int] = None,
) -> Optional[dict]:
    test_cases_json = json.dumps(test_cases) if test_cases is not None else json.dumps([])
    async with get_db() as db:
        result = await db.execute(
            text("""
                INSERT INTO ai_gateway_prompt_test_datasets
                    (organization_id, prompt_id, name, test_cases, created_by, created_at, updated_at)
                VALUES
                    (:org_id, :prompt_id, :name, CAST(:test_cases AS jsonb), :created_by, NOW(), NOW())
                RETURNING *
            """),
            {
                "org_id": org_id,
                "prompt_id": prompt_id,
                "name": name,
                "test_cases": test_cases_json,
                "created_by": created_by,
            },
        )
        await db.commit()
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def get_test_datasets(org_id: int, prompt_id: int) -> list:
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT td.*
                FROM ai_gateway_prompt_test_datasets td
                WHERE td.prompt_id = :prompt_id
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
                ORDER BY td.created_at DESC
            """),
            {"prompt_id": prompt_id, "org_id": org_id},
        )
        rows = result.mappings().fetchall()
        return [dict(r) for r in rows]


async def update_test_dataset(
    org_id: int,
    prompt_id: int,
    dataset_id: int,
    data: dict,
) -> Optional[dict]:
    allowed = {"name", "test_cases"}
    set_clauses = []
    params: dict[str, Any] = {"prompt_id": prompt_id, "dataset_id": dataset_id, "org_id": org_id}

    for key in allowed:
        if key in data:
            if key == "test_cases":
                set_clauses.append("test_cases = CAST(:test_cases AS jsonb)")
                params["test_cases"] = json.dumps(data[key])
            else:
                set_clauses.append(f"{key} = :{key}")
                params[key] = data[key]

    if not set_clauses:
        return None

    set_clauses.append("updated_at = NOW()")
    set_sql = ", ".join(set_clauses)

    async with get_db() as db:
        result = await db.execute(
            text(f"""
                UPDATE ai_gateway_prompt_test_datasets
                SET {set_sql}
                WHERE id = :dataset_id
                  AND prompt_id = :prompt_id
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
                RETURNING *
            """),
            params,
        )
        await db.commit()
        row = result.mappings().fetchone()
        return dict(row) if row else None


async def delete_test_dataset(org_id: int, prompt_id: int, dataset_id: int) -> bool:
    async with get_db() as db:
        result = await db.execute(
            text("""
                DELETE FROM ai_gateway_prompt_test_datasets
                WHERE id = :dataset_id
                  AND prompt_id = :prompt_id
                  AND EXISTS (
                      SELECT 1 FROM ai_gateway_prompts p
                      WHERE p.id = :prompt_id AND p.organization_id = :org_id
                  )
                RETURNING id
            """),
            {"dataset_id": dataset_id, "prompt_id": prompt_id, "org_id": org_id},
        )
        await db.commit()
        row = result.fetchone()
        return row is not None
