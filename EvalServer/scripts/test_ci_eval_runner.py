"""
Unit tests for ci_eval_runner.py

Tests the core logic (result parsing, threshold checking, markdown generation)
without requiring a running server or API tokens.

Run:  python -m pytest test_ci_eval_runner.py -v
  or: python test_ci_eval_runner.py
"""

import json
import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))
from ci_eval_runner import parse_results, generate_markdown, resolve_dataset, create_experiment, poll_experiment


class TestParseResults(unittest.TestCase):
    """Test result parsing and threshold logic."""

    def _make_experiment(self, avg_scores, thresholds=None, model="gpt-4o-mini"):
        return {
            "id": "exp_test_001",
            "name": "Test Experiment",
            "status": "completed",
            "config": {"model": {"name": model}},
            "results": {
                "avg_scores": avg_scores,
                "metric_thresholds": thresholds or {},
                "total_prompts": 5,
                "duration": 12345,
            },
        }

    def test_all_metrics_pass(self):
        exp = self._make_experiment({
            "correctness": 0.9,
            "completeness": 0.85,
            "answerRelevancy": 0.75,
        })
        results = parse_results(exp, threshold=0.7)

        self.assertTrue(results["passed"])
        self.assertEqual(len(results["metrics"]), 3)
        self.assertTrue(all(m["passed"] for m in results["metrics"]))
        self.assertEqual(results["experiment_id"], "exp_test_001")
        self.assertEqual(results["model"], "gpt-4o-mini")
        self.assertEqual(results["total_prompts"], 5)

    def test_metric_below_threshold_fails(self):
        exp = self._make_experiment({
            "correctness": 0.9,
            "completeness": 0.3,
        })
        results = parse_results(exp, threshold=0.7)

        self.assertFalse(results["passed"])
        completeness = next(m for m in results["metrics"] if m["name"] == "completeness")
        self.assertFalse(completeness["passed"])
        self.assertAlmostEqual(completeness["score"], 0.3)

    def test_inverted_metrics_bias_toxicity_hallucination(self):
        """Safety metrics (bias, toxicity, hallucination) use inverted logic: lower is better."""
        exp = self._make_experiment({
            "bias": 0.05,
            "toxicity": 0.0,
            "hallucination": 0.1,
        })
        results = parse_results(exp, threshold=0.7)

        self.assertTrue(results["passed"])
        for m in results["metrics"]:
            self.assertTrue(m["inverted"], f"{m['name']} should be inverted")
            self.assertTrue(m["passed"], f"{m['name']} should pass (score {m['score']} <= threshold)")

    def test_inverted_metric_fails_when_high(self):
        exp = self._make_experiment({
            "bias": 0.9,
        })
        results = parse_results(exp, threshold=0.7)

        self.assertFalse(results["passed"])
        bias = results["metrics"][0]
        self.assertTrue(bias["inverted"])
        self.assertFalse(bias["passed"])

    def test_per_metric_thresholds_override_global(self):
        exp = self._make_experiment(
            avg_scores={"correctness": 0.6, "completeness": 0.6},
            thresholds={"correctness": 0.5, "completeness": 0.8},
        )
        results = parse_results(exp, threshold=0.7)

        correctness = next(m for m in results["metrics"] if m["name"] == "correctness")
        completeness = next(m for m in results["metrics"] if m["name"] == "completeness")

        self.assertTrue(correctness["passed"])
        self.assertAlmostEqual(correctness["threshold"], 0.5)

        self.assertFalse(completeness["passed"])
        self.assertAlmostEqual(completeness["threshold"], 0.8)

    def test_edge_case_score_equals_threshold(self):
        exp = self._make_experiment({"correctness": 0.7})
        results = parse_results(exp, threshold=0.7)
        self.assertTrue(results["passed"])

    def test_empty_scores(self):
        exp = self._make_experiment({})
        results = parse_results(exp, threshold=0.7)
        self.assertTrue(results["passed"])
        self.assertEqual(len(results["metrics"]), 0)

    def test_string_results_get_parsed(self):
        exp = {
            "id": "exp_test_json",
            "name": "JSON String Test",
            "status": "completed",
            "config": json.dumps({"model": {"name": "test-model"}}),
            "results": json.dumps({
                "avg_scores": {"correctness": 0.8},
                "total_prompts": 3,
            }),
        }
        results = parse_results(exp, threshold=0.7)
        self.assertTrue(results["passed"])
        self.assertEqual(results["model"], "test-model")


class TestGenerateMarkdown(unittest.TestCase):
    """Test markdown summary generation."""

    def test_passing_report(self):
        results = {
            "experiment_id": "exp_001",
            "name": "CI Eval Test",
            "status": "completed",
            "model": "gpt-4o-mini",
            "total_prompts": 5,
            "duration_ms": 15000,
            "passed": True,
            "metrics": [
                {"name": "correctness", "score": 0.9, "threshold": 0.7, "passed": True, "inverted": False},
                {"name": "bias", "score": 0.05, "threshold": 0.7, "passed": True, "inverted": True},
            ],
        }
        md = generate_markdown(results)

        self.assertIn("## VerifyWise LLM Evaluation Results", md)
        self.assertIn("**PASS**", md)
        self.assertIn("gpt-4o-mini", md)
        self.assertIn("90.0%", md)
        self.assertIn("5.0%", md)
        self.assertIn("*(inverted)*", md)
        self.assertIn(":white_check_mark:", md)

    def test_failing_report(self):
        results = {
            "experiment_id": "exp_002",
            "name": "Failing Eval",
            "status": "completed",
            "model": "test-model",
            "total_prompts": 10,
            "duration_ms": None,
            "passed": False,
            "metrics": [
                {"name": "correctness", "score": 0.3, "threshold": 0.7, "passed": False, "inverted": False},
            ],
        }
        md = generate_markdown(results)

        self.assertIn("**FAIL**", md)
        self.assertIn(":x:", md)
        self.assertIn("30.0%", md)
        self.assertNotIn("Duration", md)

    def test_markdown_table_format(self):
        results = {
            "experiment_id": "exp_003",
            "name": "Table Test",
            "status": "completed",
            "model": "m",
            "total_prompts": 1,
            "duration_ms": None,
            "passed": True,
            "metrics": [
                {"name": "answerRelevancy", "score": 0.85, "threshold": 0.7, "passed": True, "inverted": False},
            ],
        }
        md = generate_markdown(results)

        self.assertIn("| Metric | Score | Threshold | Status |", md)
        self.assertIn("|--------|-------|-----------|--------|", md)
        self.assertIn("| answerRelevancy | 85.0% | 70% | :white_check_mark: |", md)


class TestResolveDataset(unittest.TestCase):
    """Test dataset resolution via API (mocked)."""

    @patch("ci_eval_runner.requests.get")
    def test_finds_dataset_by_id(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            {"id": 1, "name": "Easy Math", "path": "data/uploads/org1/easy_math.json"},
            {"id": 2, "name": "Coding Helper", "path": "data/uploads/org1/coding_helper.json"},
        ]
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        ds = resolve_dataset("http://localhost:3000", "fake-token", "2")
        self.assertEqual(ds["name"], "Coding Helper")
        self.assertEqual(ds["path"], "data/uploads/org1/coding_helper.json")

    @patch("ci_eval_runner.requests.get")
    def test_raises_when_not_found(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"id": 1, "name": "Only One"}]
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        with self.assertRaises(RuntimeError) as ctx:
            resolve_dataset("http://localhost:3000", "fake-token", "99")
        self.assertIn("99", str(ctx.exception))

    @patch("ci_eval_runner.requests.get")
    def test_handles_dict_response(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "datasets": [{"id": 5, "name": "Wrapped", "path": "data/wrapped.json"}]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        ds = resolve_dataset("http://localhost:3000", "t", "5")
        self.assertEqual(ds["name"], "Wrapped")


class TestCreateExperiment(unittest.TestCase):
    """Test experiment creation (mocked API)."""

    @patch("ci_eval_runner.resolve_dataset")
    @patch("ci_eval_runner.requests.post")
    def test_creates_and_returns_id(self, mock_post, mock_resolve):
        mock_resolve.return_value = {"name": "Test DS", "path": "data/test.json"}

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"experiment": {"id": "exp_new_123"}}
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = create_experiment(
            base_url="http://localhost:3000",
            token="fake",
            project_id="proj_1",
            dataset_id="1",
            metrics=["correctness", "completeness"],
            model_name="gpt-4o-mini",
            model_provider="openai",
            judge_model="gpt-4o",
            judge_provider="openai",
            threshold=0.7,
            name="Test Run",
        )

        self.assertEqual(result["id"], "exp_new_123")
        call_payload = mock_post.call_args[1]["json"]
        self.assertEqual(call_payload["config"]["dataset"]["path"], "data/test.json")
        self.assertEqual(len(call_payload["config"]["metrics"]), 2)


class TestPollExperiment(unittest.TestCase):
    """Test polling logic (mocked API)."""

    @patch("ci_eval_runner.time.sleep")
    @patch("ci_eval_runner.requests.get")
    def test_polls_until_completed(self, mock_get, mock_sleep):
        responses = [
            {"experiment": {"status": "running"}},
            {"experiment": {"status": "running"}},
            {"experiment": {"status": "completed", "results": {"avg_scores": {"x": 1.0}}}},
        ]
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json = MagicMock(side_effect=responses)
        mock_get.return_value = mock_resp

        result = poll_experiment("http://localhost:3000", "t", "exp_1", timeout_minutes=5, poll_interval=1)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(mock_sleep.call_count, 2)

    @patch("ci_eval_runner.time.sleep")
    @patch("ci_eval_runner.requests.get")
    def test_returns_on_failure(self, mock_get, mock_sleep):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"experiment": {"status": "failed", "error_message": "boom"}}
        mock_get.return_value = mock_resp

        result = poll_experiment("http://localhost:3000", "t", "exp_1", timeout_minutes=5, poll_interval=1)
        self.assertEqual(result["status"], "failed")
        mock_sleep.assert_not_called()


class TestEndToEnd(unittest.TestCase):
    """Simulate a full CI run with mocked API calls."""

    @patch("ci_eval_runner.resolve_dataset")
    @patch("ci_eval_runner.requests.post")
    @patch("ci_eval_runner.requests.get")
    @patch("ci_eval_runner.time.sleep")
    def test_full_pass_scenario(self, mock_sleep, mock_get, mock_post, mock_resolve):
        mock_resolve.return_value = {"name": "Test", "path": "data/test.json"}

        create_resp = MagicMock()
        create_resp.json.return_value = {"experiment": {"id": "exp_e2e"}}
        create_resp.raise_for_status = MagicMock()
        mock_post.return_value = create_resp

        poll_resp = MagicMock()
        poll_resp.raise_for_status = MagicMock()
        poll_resp.json.return_value = {
            "experiment": {
                "id": "exp_e2e",
                "name": "E2E Test",
                "status": "completed",
                "config": {"model": {"name": "gpt-4o-mini"}},
                "results": {
                    "avg_scores": {
                        "correctness": 0.95,
                        "completeness": 0.88,
                        "answerRelevancy": 0.92,
                    },
                    "total_prompts": 5,
                    "duration": 10000,
                },
            }
        }
        mock_get.return_value = poll_resp

        exp = create_experiment(
            "http://localhost:3000", "t", "proj_1", "1",
            ["correctness", "completeness", "answerRelevancy"],
            "gpt-4o-mini", "openai", "gpt-4o", "openai", 0.7, "E2E",
        )
        experiment = poll_experiment("http://localhost:3000", "t", exp["id"], 5, 1)
        results = parse_results(experiment, 0.7)
        md = generate_markdown(results)

        self.assertTrue(results["passed"])
        self.assertEqual(len(results["metrics"]), 3)
        self.assertIn("**PASS**", md)
        self.assertIn("95.0%", md)

    @patch("ci_eval_runner.resolve_dataset")
    @patch("ci_eval_runner.requests.post")
    @patch("ci_eval_runner.requests.get")
    @patch("ci_eval_runner.time.sleep")
    def test_full_fail_scenario(self, mock_sleep, mock_get, mock_post, mock_resolve):
        mock_resolve.return_value = {"name": "Test", "path": "data/test.json"}

        create_resp = MagicMock()
        create_resp.json.return_value = {"experiment": {"id": "exp_fail"}}
        create_resp.raise_for_status = MagicMock()
        mock_post.return_value = create_resp

        poll_resp = MagicMock()
        poll_resp.raise_for_status = MagicMock()
        poll_resp.json.return_value = {
            "experiment": {
                "id": "exp_fail",
                "name": "Fail Test",
                "status": "completed",
                "config": {"model": {"name": "weak-model"}},
                "results": {
                    "avg_scores": {
                        "correctness": 0.3,
                        "bias": 0.9,
                    },
                    "total_prompts": 5,
                },
            }
        }
        mock_get.return_value = poll_resp

        exp = create_experiment(
            "http://localhost:3000", "t", "proj_1", "1",
            ["correctness", "bias"], "weak-model", "openai",
            "gpt-4o", "openai", 0.7, "Fail",
        )
        experiment = poll_experiment("http://localhost:3000", "t", exp["id"], 5, 1)
        results = parse_results(experiment, 0.7)
        md = generate_markdown(results)

        self.assertFalse(results["passed"])
        self.assertIn("**FAIL**", md)
        self.assertIn(":x:", md)


if __name__ == "__main__":
    unittest.main(verbosity=2)
