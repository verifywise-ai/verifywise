"""
Migration Configuration for EvalServer Shared-Schema Migration

Defines table order, FK mappings, and configuration for migrating
data from tenant schemas to shared verifywise schema.
"""

from typing import Dict, List, Set

# Migration key for tracking in migration_status table
MIGRATION_KEY = "evalserver_tenant_to_shared_schema_v1"

# Batch size for bulk operations
BATCH_SIZE = 1000

# Tables ordered by dependency level for migration
# Level 0: No FK dependencies on other tenant tables
# Higher levels depend on lower levels
MIGRATION_TABLE_ORDER = {
    "level0": [
        # After rename migration, tables are prefixed with llm_evals_
        "llm_evals_organizations",
        "llm_evals_api_keys",
    ],
    "level1": [
        "llm_evals_org_members",
        "llm_evals_projects",
        "llm_evals_datasets",
        "llm_evals_scorers",
        "llm_evals_models",
    ],
    "level2": [
        "llm_evals_experiments",
        "llm_evals_arena_comparisons",
        "llm_evals_bias_audits",
    ],
    "level3": [
        "llm_evals_logs",
        "llm_evals_metrics",
        "llm_evals_bias_audit_results",
    ],
}

# Alternative table names (before rename migration)
# Maps old name -> new name
TABLE_NAME_ALIASES = {
    "deepeval_organizations": "llm_evals_organizations",
    "deepeval_org_members": "llm_evals_org_members",
    "deepeval_projects": "llm_evals_projects",
    "deepeval_user_datasets": "llm_evals_datasets",
    "deepeval_scorers": "llm_evals_scorers",
    "deepeval_arena_comparisons": "llm_evals_arena_comparisons",
    "experiments": "llm_evals_experiments",
    "evaluation_logs": "llm_evals_logs",
    "evaluation_metrics": "llm_evals_metrics",
    "evaluation_llm_api_keys": "llm_evals_api_keys",
    "deepeval_models": "llm_evals_models",
}

# FK Mappings: Maps table columns to their source tables
# During migration, old IDs are replaced with new IDs using the ID mapping
FK_MAPPINGS: Dict[str, Dict[str, str]] = {
    # Level 1 tables
    "llm_evals_org_members": {
        "org_id": "llm_evals_organizations",
    },
    "llm_evals_projects": {
        "org_id": "llm_evals_organizations",
    },
    "llm_evals_datasets": {
        "org_id": "llm_evals_organizations",
    },
    "llm_evals_scorers": {
        "org_id": "llm_evals_organizations",
    },

    # Level 2 tables
    "llm_evals_experiments": {
        "project_id": "llm_evals_projects",
        "baseline_experiment_id": "llm_evals_experiments",  # Self-reference
    },
    "llm_evals_arena_comparisons": {
        "org_id": "llm_evals_organizations",
    },
    "llm_evals_bias_audits": {
        "org_id": "llm_evals_organizations",
        "project_id": "llm_evals_projects",
    },

    # Level 3 tables
    "llm_evals_logs": {
        "project_id": "llm_evals_projects",
        "experiment_id": "llm_evals_experiments",
    },
    "llm_evals_metrics": {
        "project_id": "llm_evals_projects",
        "experiment_id": "llm_evals_experiments",
    },
    "llm_evals_bias_audit_results": {
        "audit_id": "llm_evals_bias_audits",
    },
}

# Columns that reference verifywise.users (don't remap, keep as-is)
USER_REFERENCE_COLUMNS: Set[str] = {
    "user_id",
    "created_by",
}

# Columns to exclude from copy (auto-generated in target)
EXCLUDED_COLUMNS: Dict[str, List[str]] = {
    "*": [],  # No columns excluded by default for EvalServer (IDs are VARCHAR, not SERIAL)
}

# Tables with SERIAL/auto-increment IDs (need special handling)
SERIAL_ID_TABLES: Set[str] = {
    "llm_evals_api_keys",
    "llm_evals_datasets",
    "llm_evals_bias_audit_results",
}


def get_all_tables_in_order() -> List[str]:
    """Get all tables in migration order (flat array)."""
    return [
        *MIGRATION_TABLE_ORDER["level0"],
        *MIGRATION_TABLE_ORDER["level1"],
        *MIGRATION_TABLE_ORDER["level2"],
        *MIGRATION_TABLE_ORDER["level3"],
    ]


def get_source_table_name(table_name: str, available_tables: Set[str]) -> str:
    """
    Get the actual source table name, handling aliases.

    Args:
        table_name: The canonical table name (llm_evals_*)
        available_tables: Set of tables that exist in the schema

    Returns:
        The actual table name to use
    """
    if table_name in available_tables:
        return table_name

    # Check for old names (before rename migration)
    for old_name, new_name in TABLE_NAME_ALIASES.items():
        if new_name == table_name and old_name in available_tables:
            return old_name

    return table_name
