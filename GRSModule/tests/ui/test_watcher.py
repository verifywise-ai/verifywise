import pytest
from pathlib import Path
from ui.backend.services.watcher import count_lines, get_progress


def test_count_lines_missing_file(tmp_path):
    assert count_lines(tmp_path / "nonexistent.jsonl") == 0


def test_count_lines_empty_file(tmp_path):
    f = tmp_path / "empty.jsonl"
    f.write_text("")
    assert count_lines(f) == 0


def test_count_lines_counts_nonempty_lines(tmp_path):
    f = tmp_path / "data.jsonl"
    f.write_text('{"a": 1}\n{"b": 2}\n\n{"c": 3}\n')
    assert count_lines(f) == 3


def test_count_lines_truncated_last_line(tmp_path):
    # Truncated JSON should still count as a line
    f = tmp_path / "truncated.jsonl"
    f.write_text('{"a": 1}\n{"b": 2\n')  # second line is malformed
    assert count_lines(f) == 2


def test_get_progress_no_output(tmp_path):
    result = get_progress("infer", "v0.1", tmp_path)
    assert result == []


def test_get_progress_returns_counts(tmp_path):
    final = tmp_path / "datasets" / "v0.1" / "final"
    responses = final / "responses"
    responses.mkdir(parents=True)
    (final / "scenarios.jsonl").write_text('{"id": "s1"}\n{"id": "s2"}\n')
    (responses / "model_a.jsonl").write_text('{"id": "r1"}\n')
    (responses / "model_a.jsonl.failures.jsonl").write_text('{"id": "f1"}\n')

    result = get_progress("infer", "v0.1", tmp_path)
    assert len(result) == 1
    assert result[0].model_id == "model_a"
    assert result[0].completed == 2  # 1 success + 1 failure
    assert result[0].failures == 1
    assert result[0].total == 2  # scenarios count


def test_get_progress_ignores_patch_failures(tmp_path):
    final = tmp_path / "datasets" / "v0.1" / "final"
    scores = final / "judge_scores"
    scores.mkdir(parents=True)
    (final / "scenarios.jsonl").write_text('{"id": "s1"}\n')
    (scores / "model_b.jsonl").write_text('{"id": "j1"}\n')
    (scores / "model_b.jsonl.failures.jsonl").write_text("")
    (scores / "model_b.jsonl.patch_failures.jsonl").write_text('{"id": "p1"}\n')

    result = get_progress("judge", "v0.1", tmp_path)
    assert len(result) == 1
    assert result[0].failures == 0  # patch_failures not counted
