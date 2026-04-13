"""
Parse CSV demographic data for bias audits.

Reads a CSV file with demographic columns and either a binary outcome column,
a numeric score column, or prediction + ground-truth columns, then produces
structured records for the computation engine.
"""

import csv
import io
import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

VALID_TRUE = {"1", "true", "yes", "selected", "hired", "promoted"}
VALID_FALSE = {"0", "false", "no", "rejected", "declined", "not selected"}


def _decode_csv(csv_bytes: bytes) -> str:
    """Decode CSV bytes with fallback encodings."""
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return csv_bytes.decode(encoding)
        except (UnicodeDecodeError, ValueError):
            continue
    raise ValueError("Unable to decode CSV file. Please ensure it is UTF-8 encoded.")


def _parse_bool(value: str) -> Optional[bool]:
    """Parse a cell value into True/False, or None if unrecognized."""
    v = value.strip().lower()
    if v in VALID_TRUE:
        return True
    if v in VALID_FALSE:
        return False
    return None


def _parse_float(value: str) -> Optional[float]:
    """Parse a cell value into a float, or None if not numeric."""
    v = value.strip()
    if not v:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def parse_csv_dataset(
    csv_bytes: bytes,
    column_mapping: Dict[str, str],
    outcome_column: str,
    score_column: Optional[str] = None,
    prediction_column: Optional[str] = None,
    ground_truth_column: Optional[str] = None,
) -> Tuple[List[Dict], int]:
    """
    Parse CSV bytes into a list of record dicts.

    Args:
        csv_bytes: Raw CSV file content.
        column_mapping: Maps preset category keys to CSV column names.
        outcome_column: Column containing the binary outcome (selection rate mode).
        score_column: Optional column containing a numeric score (scoring rate mode).
        prediction_column: Optional column containing the model prediction (binary).
        ground_truth_column: Optional column containing the ground truth label (binary).

    Returns:
        (records, unknown_count) where each record has keys for each category,
        plus any of "selected" / "score" / "prediction" / "ground_truth" that were
        resolved from the CSV.
    """
    text = _decode_csv(csv_bytes)
    reader = csv.DictReader(io.StringIO(text))

    records: List[Dict] = []
    unknown_count = 0
    unknown_outcome_count = 0

    if reader.fieldnames is None:
        return [], 0

    header_map: Dict[str, str] = {h.strip().lower(): h.strip() for h in reader.fieldnames}

    # Resolve column mapping to actual CSV header names (skip empty mappings)
    resolved_mapping: Dict[str, str] = {}
    for category_key, csv_col in column_mapping.items():
        if not csv_col or not csv_col.strip():
            continue
        csv_col_lower = csv_col.strip().lower()
        if csv_col_lower in header_map:
            resolved_mapping[category_key] = header_map[csv_col_lower]
        else:
            resolved_mapping[category_key] = csv_col.strip()

    def _resolve(col: Optional[str]) -> Optional[str]:
        if not col:
            return None
        return header_map.get(col.strip().lower(), col.strip())

    resolved_outcome = _resolve(outcome_column)
    resolved_score = _resolve(score_column)
    resolved_prediction = _resolve(prediction_column)
    resolved_ground_truth = _resolve(ground_truth_column)

    for row in reader:
        record: Dict = {}
        has_missing = False

        for category_key, csv_col in resolved_mapping.items():
            value = (row.get(csv_col) or "").strip()
            if not value:
                has_missing = True
            record[category_key] = value

        if resolved_outcome:
            outcome_raw = (row.get(resolved_outcome) or "").strip()
            parsed = _parse_bool(outcome_raw)
            if parsed is None:
                record["selected"] = False
                if outcome_raw:
                    unknown_outcome_count += 1
            else:
                record["selected"] = parsed

        if resolved_score:
            score_val = _parse_float(row.get(resolved_score) or "")
            if score_val is None:
                has_missing = True
            record["score"] = score_val

        if resolved_prediction:
            pred = _parse_bool(row.get(resolved_prediction) or "")
            if pred is None:
                has_missing = True
            record["prediction"] = pred

        if resolved_ground_truth:
            truth = _parse_bool(row.get(resolved_ground_truth) or "")
            if truth is None:
                has_missing = True
            record["ground_truth"] = truth

        if has_missing:
            unknown_count += 1
        else:
            records.append(record)

    if unknown_outcome_count > 0:
        logger.warning(
            f"[BiasAudit] {unknown_outcome_count} rows had unrecognized outcome values "
            f"(not in {VALID_TRUE | VALID_FALSE}), treated as not selected"
        )

    return records, unknown_count


def parse_csv_headers(csv_bytes: bytes) -> List[str]:
    """Parse just the headers from a CSV file."""
    text = _decode_csv(csv_bytes)
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return []
    return [h.strip() for h in reader.fieldnames]
