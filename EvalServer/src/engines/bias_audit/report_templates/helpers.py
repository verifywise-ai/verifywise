"""Shared helpers for bias audit report templates.

These functions extract data from the audit results dict and are used
by multiple framework templates. They are framework-agnostic.
"""

from typing import Any, Dict, List, Tuple


def min_impact_ratio(results: Dict[str, Any]) -> Tuple[float, str]:
    """Find the minimum impact ratio across all non-excluded result rows.

    Returns (min_ratio, group_name). If no valid ratios, returns (1.0, "").
    """
    min_ratio = 1.0
    group_name = ""
    for table in results.get("tables", []):
        for row in table.get("rows", []):
            if row.get("excluded", False):
                continue
            ratio = row.get("impact_ratio")
            if ratio is not None and ratio < min_ratio:
                min_ratio = ratio
                group_name = row.get("category_name", "")
    return (min_ratio, group_name)


def category_names_from_tables(results: Dict[str, Any]) -> List[str]:
    """Extract non-intersectional category titles from results tables."""
    names: List[str] = []
    for table in results.get("tables", []):
        title = table.get("title", "")
        key = table.get("category_key", "")
        if key == "intersectional" or " x " in key.lower() or "\u00d7" in key.lower():
            continue
        if title and title not in names:
            names.append(title)
    return names


def count_evaluated_groups(results: Dict[str, Any]) -> Tuple[int, int]:
    """Return (total_evaluated, total_flagged) across all tables.

    Excluded rows are not counted.
    """
    total_evaluated = 0
    total_flagged = 0
    for table in results.get("tables", []):
        for row in table.get("rows", []):
            if row.get("excluded", False):
                continue
            total_evaluated += 1
            if row.get("flagged", False):
                total_flagged += 1
    return (total_evaluated, total_flagged)


def has_category(results: Dict[str, Any], keyword: str) -> bool:
    """Check whether results contain a table whose category_key contains keyword."""
    kw = keyword.lower()
    for table in results.get("tables", []):
        if kw in table.get("category_key", "").lower():
            return True
    return False
