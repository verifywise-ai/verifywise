"""
Comprehensive tests for the VerifyWise Python SDK.

All API calls are mocked — no running server needed.

Run:  cd EvalServer/sdk && python -m pytest tests/ -v
"""

import json
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

from verifywise import (
    VerifyWiseClient,
    Experiment,
    EvalResults,
    MetricResult,
    Dataset,
    ModelConfig,
    Scorer,
    Report,
    Project,
    Org,
    ArenaComparison,
    BiasAudit,
)
from verifywise.exceptions import (
    AuthenticationError,
    NotFoundError,
    ValidationError,
    ServerError,
    TimeoutError,
    VerifyWiseError,
)


def _mock_response(status_code=200, json_data=None, content=b"", text=""):
    resp = MagicMock()
    resp.status_code = status_code
    resp.ok = 200 <= status_code < 300
    resp.json.return_value = json_data or {}
    resp.content = content or (json.dumps(json_data).encode() if json_data else b"")
    resp.text = text or (json.dumps(json_data) if json_data else "")
    return resp


def _make_client():
    """Create a client with a mocked session."""
    client = VerifyWiseClient(api_url="http://localhost:3000", token="test-token")
    client._session = MagicMock()
    return client


# ============================================================
# Client core
# ============================================================

class TestClient(unittest.TestCase):

    def test_url_construction(self):
        client = VerifyWiseClient.__new__(VerifyWiseClient)
        client.api_url = "http://localhost:3000"
        self.assertEqual(client._url("experiments"), "http://localhost:3000/api/deepeval/experiments")
        self.assertEqual(client._url("/experiments"), "http://localhost:3000/api/deepeval/experiments")

    def test_url_strips_trailing_slash(self):
        client = VerifyWiseClient.__new__(VerifyWiseClient)
        client.api_url = "http://localhost:3000/"
        # __init__ rstrips, but test the raw case
        client.api_url = client.api_url.rstrip("/")
        self.assertEqual(client._url("projects"), "http://localhost:3000/api/deepeval/projects")

    def test_auth_header_set(self):
        client = VerifyWiseClient(api_url="http://test", token="my-jwt")
        self.assertEqual(client._session.headers["Authorization"], "Bearer my-jwt")

    def test_error_401_raises_auth_error(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(401, text='{"message":"Unauthorized"}')
        with self.assertRaises(AuthenticationError) as ctx:
            client._request("GET", "projects")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_error_406_raises_auth_error(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(406, text='{"message":"Token expired"}')
        with self.assertRaises(AuthenticationError):
            client._request("GET", "projects")

    def test_error_404_raises_not_found(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(404, text="Not found")
        with self.assertRaises(NotFoundError):
            client._request("GET", "experiments/nonexistent")

    def test_error_400_raises_validation(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(400, text="Bad request")
        with self.assertRaises(ValidationError):
            client._request("POST", "experiments", json={})

    def test_error_500_raises_server_error(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(500, text="Internal error")
        with self.assertRaises(ServerError):
            client._request("GET", "projects")

    def test_error_418_raises_generic(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(418, text="I'm a teapot")
        with self.assertRaises(VerifyWiseError):
            client._request("GET", "projects")

    def test_empty_response_returns_none(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(204, content=b"")
        result = client._request("DELETE", "experiments/123")
        self.assertIsNone(result)

    def test_json_parse_fallback_to_text(self):
        client = _make_client()
        resp = _mock_response(200, content=b"plain text")
        resp.json.side_effect = ValueError("not json")
        resp.text = "plain text"
        client._session.request.return_value = resp
        result = client._request("GET", "some/path")
        self.assertEqual(result, "plain text")


# ============================================================
# Models (dataclasses)
# ============================================================

class TestModels(unittest.TestCase):

    def test_experiment_from_dict(self):
        exp = Experiment.from_dict({
            "id": "exp_001",
            "name": "Test",
            "status": "completed",
            "project_id": "proj_1",
            "config": {"model": {"name": "gpt-4o"}},
            "results": {"avg_scores": {"correctness": 0.9}},
            "created_at": "2026-01-01T00:00:00Z",
        })
        self.assertEqual(exp.id, "exp_001")
        self.assertEqual(exp.status, "completed")
        self.assertEqual(exp.config["model"]["name"], "gpt-4o")

    def test_experiment_from_dict_defaults(self):
        exp = Experiment.from_dict({})
        self.assertEqual(exp.id, "")
        self.assertEqual(exp.status, "unknown")
        self.assertEqual(exp.config, {})
        self.assertIsNone(exp.results)

    def test_eval_results_all_pass(self):
        exp = Experiment.from_dict({
            "id": "exp_1",
            "name": "Test",
            "status": "completed",
            "config": {"model": {"name": "gpt-4o-mini"}},
            "results": {
                "avg_scores": {"correctness": 0.9, "completeness": 0.8},
                "total_prompts": 5,
            },
        })
        results = EvalResults.from_experiment(exp, default_threshold=0.7)
        self.assertTrue(results.passed)
        self.assertEqual(len(results.metrics), 2)
        self.assertEqual(results.model, "gpt-4o-mini")
        self.assertEqual(results.total_prompts, 5)

    def test_eval_results_inverted_metric(self):
        exp = Experiment.from_dict({
            "id": "exp_2",
            "name": "Safety",
            "status": "completed",
            "config": {"model": {"name": "m"}},
            "results": {"avg_scores": {"bias": 0.05, "toxicity": 0.0, "hallucination": 0.1}},
        })
        results = EvalResults.from_experiment(exp, default_threshold=0.5)
        self.assertTrue(results.passed)
        for m in results.metrics:
            self.assertTrue(m.inverted)
            self.assertTrue(m.passed)

    def test_eval_results_fail(self):
        exp = Experiment.from_dict({
            "id": "exp_3",
            "name": "Fail",
            "status": "completed",
            "config": {"model": {"name": "m"}},
            "results": {"avg_scores": {"correctness": 0.3}},
        })
        results = EvalResults.from_experiment(exp, default_threshold=0.7)
        self.assertFalse(results.passed)
        self.assertFalse(results.metrics[0].passed)

    def test_eval_results_per_metric_threshold(self):
        exp = Experiment.from_dict({
            "id": "exp_4",
            "name": "Thresholds",
            "status": "completed",
            "config": {"model": {"name": "m"}},
            "results": {
                "avg_scores": {"correctness": 0.6},
                "metric_thresholds": {"correctness": 0.5},
            },
        })
        results = EvalResults.from_experiment(exp, default_threshold=0.7)
        self.assertTrue(results.passed)
        self.assertAlmostEqual(results.metrics[0].threshold, 0.5)

    def test_dataset_from_dict(self):
        ds = Dataset.from_dict({"id": 2, "name": "Coding", "path": "data/test.json", "prompt_count": 10})
        self.assertEqual(ds.id, 2)
        self.assertEqual(ds.prompt_count, 10)

    def test_report_from_dict(self):
        r = Report.from_dict({"id": "r_1", "title": "Test", "format": "pdf", "fileSize": 1024, "experimentIds": ["e1"]})
        self.assertEqual(r.file_size, 1024)
        self.assertEqual(r.experiment_ids, ["e1"])

    def test_project_from_dict(self):
        p = Project.from_dict({"id": "p_1", "name": "My Project", "useCase": "chatbot"})
        self.assertEqual(p.use_case, "chatbot")

    def test_model_config_from_dict(self):
        m = ModelConfig.from_dict({"id": 1, "name": "GPT", "provider": "openai", "model_name": "gpt-4o"})
        self.assertEqual(m.provider, "openai")

    def test_scorer_from_dict(self):
        s = Scorer.from_dict({"id": 1, "name": "Custom", "provider": "openai", "model": "gpt-4o"})
        self.assertEqual(s.model, "gpt-4o")

    def test_arena_comparison_from_dict(self):
        c = ArenaComparison.from_dict({"id": "c_1", "status": "completed", "contestants": [{"name": "A"}]})
        self.assertEqual(len(c.contestants), 1)

    def test_bias_audit_from_dict(self):
        a = BiasAudit.from_dict({"id": "a_1", "status": "running", "config": {"preset": "hiring"}})
        self.assertEqual(a.config["preset"], "hiring")


# ============================================================
# Experiments API
# ============================================================

class TestExperimentsAPI(unittest.TestCase):

    def test_create(self):
        client = _make_client()
        client._session.request.side_effect = [
            _mock_response(200, json_data=[{"id": 2, "name": "DS", "path": "data/ds.json"}]),
            _mock_response(200, json_data={"experiment": {"id": "exp_new", "name": "Test", "status": "pending"}}),
        ]
        exp = client.experiments.create(
            "proj_1", "Test",
            model_name="gpt-4o-mini", model_provider="openai",
            dataset_id="2", metrics=["correctness"],
        )
        self.assertEqual(exp.id, "exp_new")
        call_args = client._session.request.call_args_list[1]
        payload = call_args[1]["json"]
        self.assertEqual(payload["config"]["dataset"]["path"], "data/ds.json")

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "experiments": [
                {"id": "exp_1", "name": "A", "status": "completed"},
                {"id": "exp_2", "name": "B", "status": "running"},
            ]
        })
        exps = client.experiments.list(project_id="proj_1")
        self.assertEqual(len(exps), 2)
        self.assertIsInstance(exps[0], Experiment)

    def test_get(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "experiment": {"id": "exp_1", "name": "Test", "status": "completed"}
        })
        exp = client.experiments.get("exp_1")
        self.assertEqual(exp.id, "exp_1")

    def test_delete(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(204, content=b"")
        client.experiments.delete("exp_1")
        self.assertEqual(client._session.request.call_count, 1)

    @patch("verifywise.experiments.time.sleep")
    def test_poll_until_completed(self, mock_sleep):
        client = _make_client()
        client._session.request.side_effect = [
            _mock_response(200, json_data={"experiment": {"id": "e", "name": "T", "status": "running"}}),
            _mock_response(200, json_data={"experiment": {"id": "e", "name": "T", "status": "running"}}),
            _mock_response(200, json_data={"experiment": {"id": "e", "name": "T", "status": "completed", "results": {"avg_scores": {}}}}),
        ]
        statuses = []
        exp = client.experiments.poll("e", timeout_minutes=5, poll_interval=1, on_status=statuses.append)
        self.assertEqual(exp.status, "completed")
        self.assertEqual(statuses, ["running", "completed"])

    @patch("verifywise.experiments.time.sleep")
    @patch("verifywise.experiments.time.time")
    def test_poll_timeout(self, mock_time, mock_sleep):
        mock_time.side_effect = [0, 0, 100]  # immediately past deadline
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "experiment": {"id": "e", "name": "T", "status": "running"}
        })
        with self.assertRaises(TimeoutError):
            client.experiments.poll("e", timeout_minutes=0, poll_interval=1)

    @patch("verifywise.experiments.time.sleep")
    def test_run_and_wait(self, mock_sleep):
        client = _make_client()
        client._session.request.side_effect = [
            _mock_response(200, json_data=[{"id": 1, "name": "DS", "path": "data/ds.json"}]),
            _mock_response(200, json_data={"experiment": {"id": "e1", "name": "CI", "status": "pending"}}),
            _mock_response(200, json_data={"experiment": {
                "id": "e1", "name": "CI", "status": "completed",
                "config": {"model": {"name": "gpt-4o-mini"}},
                "results": {"avg_scores": {"correctness": 0.95}, "total_prompts": 5},
            }}),
        ]
        results = client.experiments.run_and_wait(
            "proj_1", "CI Eval",
            model_name="gpt-4o-mini", model_provider="openai",
            dataset_id="1", metrics=["correctness"], threshold=0.7,
        )
        self.assertIsInstance(results, EvalResults)
        self.assertTrue(results.passed)
        self.assertEqual(results.metrics[0].name, "correctness")


# ============================================================
# Datasets API
# ============================================================

class TestDatasetsAPI(unittest.TestCase):

    def test_list_user(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": 1, "name": "Math", "path": "data/math.json", "prompt_count": 5},
        ])
        datasets = client.datasets.list_user()
        self.assertEqual(len(datasets), 1)
        self.assertIsInstance(datasets[0], Dataset)
        self.assertEqual(datasets[0].name, "Math")

    def test_list_user_dict_response(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "datasets": [{"id": 1, "name": "Math"}]
        })
        datasets = client.datasets.list_user()
        self.assertEqual(len(datasets), 1)

    def test_read(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"input": "2+2", "expected_output": "4"},
        ])
        prompts = client.datasets.read("data/math.json")
        self.assertEqual(len(prompts), 1)

    def test_delete(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={"success": True})
        client.datasets.delete(["data/old.json"])
        call_args = client._session.request.call_args
        self.assertEqual(call_args[1]["json"], {"paths": ["data/old.json"]})


# ============================================================
# Models API
# ============================================================

class TestModelsAPI(unittest.TestCase):

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": 1, "name": "GPT", "provider": "openai", "model_name": "gpt-4o"},
        ])
        models = client.models.list()
        self.assertEqual(len(models), 1)
        self.assertIsInstance(models[0], ModelConfig)

    def test_create(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "id": 2, "name": "Claude", "provider": "anthropic", "model_name": "claude-3-5-haiku",
        })
        m = client.models.create("Claude", provider="anthropic", model_name="claude-3-5-haiku")
        self.assertEqual(m.provider, "anthropic")


# ============================================================
# Scorers API
# ============================================================

class TestScorersAPI(unittest.TestCase):

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": 1, "name": "Custom", "provider": "openai", "model": "gpt-4o"},
        ])
        scorers = client.scorers.list()
        self.assertEqual(len(scorers), 1)
        self.assertIsInstance(scorers[0], Scorer)

    def test_test_scorer(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={"score": 0.85})
        result = client.scorers.test(1, input_text="What is 2+2?", output_text="4")
        self.assertEqual(result["score"], 0.85)


# ============================================================
# Reports API
# ============================================================

class TestReportsAPI(unittest.TestCase):

    def test_generate(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "id": "r_1", "title": "Test Report", "format": "pdf", "fileSize": 2048,
        })
        report = client.reports.generate(["exp_1", "exp_2"], project_id="proj_1", title="Test Report")
        self.assertIsInstance(report, Report)
        self.assertEqual(report.id, "r_1")

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": "r_1", "title": "Report A", "format": "pdf", "fileSize": 1024},
        ])
        reports = client.reports.list()
        self.assertEqual(len(reports), 1)

    def test_download(self):
        client = _make_client()
        pdf_bytes = b"%PDF-1.4 fake content"
        client._session.request.return_value = _mock_response(200, content=pdf_bytes)
        content = client.reports.download("r_1")
        self.assertEqual(content, pdf_bytes)

    def test_download_to_file(self):
        client = _make_client()
        pdf_bytes = b"%PDF-1.4 test"
        client._session.request.return_value = _mock_response(200, content=pdf_bytes)

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            path = f.name
        try:
            result_path = client.reports.download_to_file("r_1", path)
            self.assertEqual(result_path, path)
            with open(path, "rb") as f:
                self.assertEqual(f.read(), pdf_bytes)
        finally:
            os.unlink(path)

    def test_delete(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={"success": True})
        client.reports.delete("r_1")
        call_args = client._session.request.call_args
        self.assertIn("reports/r_1", call_args[0][1])

    def test_generate_and_download(self):
        client = _make_client()
        client._session.request.side_effect = [
            _mock_response(200, json_data={"id": "r_2", "title": "Combined", "format": "pdf", "fileSize": 512}),
            _mock_response(200, content=b"%PDF-1.4 combined"),
        ]
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            path = f.name
        try:
            report = client.reports.generate_and_download(["exp_1"], path, title="Combined")
            self.assertEqual(report.id, "r_2")
            with open(path, "rb") as f:
                self.assertEqual(f.read(), b"%PDF-1.4 combined")
        finally:
            os.unlink(path)


# ============================================================
# Arena API
# ============================================================

class TestArenaAPI(unittest.TestCase):

    def test_compare(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "id": "c_1", "status": "running", "contestants": [{"name": "A"}, {"name": "B"}],
        })
        comp = client.arena.compare([{"name": "A"}, {"name": "B"}])
        self.assertIsInstance(comp, ArenaComparison)
        self.assertEqual(comp.status, "running")

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": "c_1", "status": "completed"},
        ])
        comps = client.arena.list()
        self.assertEqual(len(comps), 1)

    @patch("verifywise.arena.time.sleep")
    def test_compare_and_wait(self, mock_sleep):
        client = _make_client()
        client._session.request.side_effect = [
            _mock_response(200, json_data={"id": "c_1", "status": "running"}),
            _mock_response(200, json_data={"id": "c_1", "status": "completed"}),
            _mock_response(200, json_data={"winner": "A", "scores": {"A": 0.8, "B": 0.6}}),
        ]
        results = client.arena.compare_and_wait([{"name": "A"}, {"name": "B"}], timeout_minutes=5, poll_interval=1)
        self.assertEqual(results["winner"], "A")


# ============================================================
# Projects API
# ============================================================

class TestProjectsAPI(unittest.TestCase):

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": "p_1", "name": "My Project"},
        ])
        projects = client.projects.list()
        self.assertEqual(len(projects), 1)
        self.assertIsInstance(projects[0], Project)

    def test_create(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "id": "p_2", "name": "New", "description": "test",
        })
        p = client.projects.create("New", description="test")
        self.assertEqual(p.name, "New")

    def test_stats(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "total_experiments": 15, "completed": 12,
        })
        stats = client.projects.stats("p_1")
        self.assertEqual(stats["total_experiments"], 15)


# ============================================================
# Orgs API
# ============================================================

class TestOrgsAPI(unittest.TestCase):

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": "o_1", "name": "Org 1"},
        ])
        orgs = client.orgs.list()
        self.assertEqual(len(orgs), 1)
        self.assertIsInstance(orgs[0], Org)

    def test_list_projects(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"id": "p_1", "name": "Project A"},
        ])
        projects = client.orgs.list_projects("o_1")
        self.assertEqual(len(projects), 1)
        self.assertIsInstance(projects[0], Project)


# ============================================================
# Logs API
# ============================================================

class TestLogsAPI(unittest.TestCase):

    def test_list(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "logs": [{"id": "l_1", "status": "success"}]
        })
        logs = client.logs.list(project_id="p_1")
        self.assertEqual(len(logs), 1)

    def test_list_returns_array(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[{"id": "l_1"}])
        logs = client.logs.list()
        self.assertEqual(len(logs), 1)


# ============================================================
# Metrics API
# ============================================================

class TestMetricsAPI(unittest.TestCase):

    def test_available(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data=[
            {"name": "correctness", "requires_context": False},
            {"name": "faithfulness", "requires_context": True},
        ])
        metrics = client.metrics.available()
        self.assertEqual(len(metrics), 2)

    def test_aggregates(self):
        client = _make_client()
        client._session.request.return_value = _mock_response(200, json_data={
            "metric": "correctness", "avg": 0.85, "count": 100,
        })
        agg = client.metrics.aggregates("p_1", metric_name="correctness")
        self.assertAlmostEqual(agg["avg"], 0.85)


# ============================================================
# End-to-end scenario
# ============================================================

class TestEndToEnd(unittest.TestCase):

    @patch("verifywise.experiments.time.sleep")
    def test_full_ci_workflow(self, mock_sleep):
        """Simulate a full CI workflow: create -> poll -> parse -> report -> download."""
        client = _make_client()
        client._session.request.side_effect = [
            # 1. resolve dataset
            _mock_response(200, json_data=[{"id": 1, "name": "QA", "path": "data/qa.json"}]),
            # 2. create experiment
            _mock_response(200, json_data={"experiment": {"id": "exp_ci", "name": "CI", "status": "pending"}}),
            # 3. poll -> completed
            _mock_response(200, json_data={"experiment": {
                "id": "exp_ci", "name": "CI", "status": "completed",
                "config": {"model": {"name": "gpt-4o-mini"}},
                "results": {
                    "avg_scores": {"correctness": 0.95, "completeness": 0.88, "hallucination": 0.02},
                    "metric_thresholds": {"correctness": 0.7, "completeness": 0.7, "hallucination": 0.7},
                    "total_prompts": 5,
                    "duration": 12345,
                },
            }}),
            # 4. generate report
            _mock_response(200, json_data={"id": "r_ci", "title": "CI Report", "format": "pdf", "fileSize": 4096}),
            # 5. download report
            _mock_response(200, content=b"%PDF-1.4 test content"),
        ]

        # Step 1: Run evaluation
        results = client.experiments.run_and_wait(
            "proj_1", "CI Eval",
            model_name="gpt-4o-mini", model_provider="openai",
            dataset_id="1", metrics=["correctness", "completeness", "hallucination"],
            threshold=0.7,
        )
        self.assertTrue(results.passed)
        self.assertEqual(len(results.metrics), 3)

        hallucination = next(m for m in results.metrics if m.name == "hallucination")
        self.assertTrue(hallucination.inverted)
        self.assertTrue(hallucination.passed)  # 0.02 <= 0.7

        # Step 2: Generate and download report
        report = client.reports.generate(
            [results.experiment_id],
            project_id="proj_1",
            title="CI Report",
        )
        self.assertEqual(report.id, "r_ci")

        content = client.reports.download(report.id)
        self.assertTrue(content.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
