"""
Tests for the VerifyWise CLI.

Verifies help output, argument parsing, error handling, and that
commands correctly call the SDK client and format output.

Run:  cd EvalServer/sdk && python -m pytest tests/test_cli.py -v
"""

import json
import os
import unittest
from io import StringIO
from unittest.mock import MagicMock, patch

from verifywise.cli import main, _table, _build_parser
from verifywise.models import (
    Dataset, EvalResults, Experiment, MetricResult, ModelConfig,
    Org, Project, Report, Scorer,
)


class TestCLIHelp(unittest.TestCase):
    """Top-level and subcommand --help must exit 0 and contain key text."""

    def _run(self, argv):
        with self.assertRaises(SystemExit) as ctx:
            main(argv)
        return ctx.exception.code

    def test_top_level_help(self):
        code = self._run(["--help"])
        self.assertEqual(code, 0)

    def test_version(self):
        code = self._run(["--version"])
        self.assertEqual(code, 0)

    def test_projects_help(self):
        code = self._run(["projects", "--help"])
        self.assertEqual(code, 0)

    def test_experiments_help(self):
        code = self._run(["experiments", "--help"])
        self.assertEqual(code, 0)

    def test_experiments_run_help(self):
        code = self._run(["experiments", "run", "--help"])
        self.assertEqual(code, 0)

    def test_datasets_help(self):
        code = self._run(["datasets", "--help"])
        self.assertEqual(code, 0)

    def test_reports_help(self):
        code = self._run(["reports", "--help"])
        self.assertEqual(code, 0)

    def test_metrics_help(self):
        code = self._run(["metrics", "--help"])
        self.assertEqual(code, 0)

    def test_models_help(self):
        code = self._run(["models", "--help"])
        self.assertEqual(code, 0)

    def test_scorers_help(self):
        code = self._run(["scorers", "--help"])
        self.assertEqual(code, 0)

    def test_logs_help(self):
        code = self._run(["logs", "--help"])
        self.assertEqual(code, 0)

    def test_no_args_prints_help(self):
        code = self._run([])
        self.assertEqual(code, 0)


class TestCLIAuthErrors(unittest.TestCase):
    """Commands must fail gracefully when auth is missing."""

    def test_missing_api_url(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("VW_API_URL", None)
            os.environ.pop("VW_API_TOKEN", None)
            with self.assertRaises(SystemExit) as ctx:
                main(["projects", "list"])
            self.assertEqual(ctx.exception.code, 1)

    def test_missing_token(self):
        with patch.dict(os.environ, {"VW_API_URL": "http://test"}, clear=True):
            os.environ.pop("VW_API_TOKEN", None)
            with self.assertRaises(SystemExit) as ctx:
                main(["projects", "list"])
            self.assertEqual(ctx.exception.code, 1)


class TestCLIConfig(unittest.TestCase):

    @patch("sys.stdout", new_callable=StringIO)
    def test_config_shows_masked_token(self, mock_stdout):
        main(["--api-url", "http://test", "--token", "supersecrettoken123", "config"])
        output = mock_stdout.getvalue()
        self.assertIn("http://test", output)
        self.assertIn("supersec", output)
        self.assertIn("...", output)
        self.assertNotIn("supersecrettoken123", output)


class TestCLITableFormatting(unittest.TestCase):

    @patch("sys.stdout", new_callable=StringIO)
    def test_table_output(self, mock_stdout):
        rows = [
            {"id": "1", "name": "Alpha"},
            {"id": "2", "name": "Beta"},
        ]
        _table(rows, ["id", "name"])
        output = mock_stdout.getvalue()
        self.assertIn("ID", output)
        self.assertIn("NAME", output)
        self.assertIn("Alpha", output)
        self.assertIn("Beta", output)

    @patch("sys.stdout", new_callable=StringIO)
    def test_table_empty(self, mock_stdout):
        _table([], ["id", "name"])
        self.assertIn("no results", mock_stdout.getvalue())


def _mock_client():
    """Return a mock VerifyWiseClient."""
    client = MagicMock()
    return client


class TestCLIProjectCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_projects_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.projects.list.return_value = [
            Project(id="p1", name="Alpha", use_case="chatbot", created_at="2026-01-01"),
            Project(id="p2", name="Beta", use_case="rag", created_at="2026-02-01"),
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "projects", "list"])
        output = mock_stdout.getvalue()
        self.assertIn("Alpha", output)
        self.assertIn("Beta", output)

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_projects_list_json(self, mock_stdout, MockClient):
        client = _mock_client()
        client.projects.list.return_value = [
            Project(id="p1", name="Alpha"),
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "--json", "projects", "list"])
        data = json.loads(mock_stdout.getvalue())
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Alpha")

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_projects_get(self, mock_stdout, MockClient):
        client = _mock_client()
        client.projects.get.return_value = Project(id="p1", name="Alpha", description="Test")
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "projects", "get", "p1"])
        output = mock_stdout.getvalue()
        self.assertIn("Alpha", output)
        self.assertIn("Test", output)

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_projects_create(self, mock_stdout, MockClient):
        client = _mock_client()
        client.projects.create.return_value = Project(id="p_new", name="New")
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "projects", "create", "--name", "New"])
        self.assertIn("p_new", mock_stdout.getvalue())

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_projects_delete(self, mock_stdout, MockClient):
        client = _mock_client()
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "projects", "delete", "p1"])
        self.assertIn("Deleted", mock_stdout.getvalue())


class TestCLIExperimentCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_experiments_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.experiments.list.return_value = [
            Experiment(id="e1", name="Eval A", status="completed"),
            Experiment(id="e2", name="Eval B", status="running"),
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "experiments", "list"])
        output = mock_stdout.getvalue()
        self.assertIn("Eval A", output)
        self.assertIn("completed", output)

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_experiments_get(self, mock_stdout, MockClient):
        client = _mock_client()
        client.experiments.get.return_value = Experiment(
            id="e1", name="Eval A", status="completed",
            results={"avg_scores": {"correctness": 0.92}},
        )
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "experiments", "get", "e1"])
        output = mock_stdout.getvalue()
        self.assertIn("92.0%", output)

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_experiments_run(self, mock_stdout, MockClient):
        client = _mock_client()
        client.experiments.run_and_wait.return_value = EvalResults(
            experiment_id="e1", name="CI", status="completed",
            model="gpt-4o-mini", passed=True, total_prompts=5,
            metrics=[
                MetricResult(name="correctness", score=0.92, threshold=0.7, passed=True),
                MetricResult(name="hallucination", score=0.05, threshold=0.7, passed=True, inverted=True),
            ],
        )
        MockClient.return_value = client

        main([
            "--api-url", "http://test", "--token", "tok",
            "experiments", "run",
            "--project-id", "p1", "--name", "CI",
            "--model-name", "gpt-4o-mini", "--model-provider", "openai",
            "--dataset-id", "2", "--metrics", "correctness,hallucination",
        ])
        output = mock_stdout.getvalue()
        self.assertIn("PASS", output)
        self.assertIn("92.0%", output)
        self.assertIn("5.0%", output)

    @patch("verifywise.cli.VerifyWiseClient")
    def test_experiments_run_failure_exits_1(self, MockClient):
        client = _mock_client()
        client.experiments.run_and_wait.return_value = EvalResults(
            experiment_id="e1", name="CI", status="completed",
            model="weak", passed=False,
            metrics=[MetricResult(name="correctness", score=0.3, threshold=0.7, passed=False)],
        )
        MockClient.return_value = client

        with self.assertRaises(SystemExit) as ctx:
            main([
                "--api-url", "http://test", "--token", "tok",
                "experiments", "run",
                "--project-id", "p1", "--name", "CI",
                "--model-name", "m", "--model-provider", "openai",
                "--dataset-id", "2", "--metrics", "correctness",
            ])
        self.assertEqual(ctx.exception.code, 1)

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_experiments_run_json_output(self, mock_stdout, MockClient):
        client = _mock_client()
        client.experiments.run_and_wait.return_value = EvalResults(
            experiment_id="e1", name="CI", status="completed",
            model="gpt-4o-mini", passed=True,
            metrics=[MetricResult(name="correctness", score=0.9, threshold=0.7, passed=True)],
        )
        MockClient.return_value = client

        main([
            "--api-url", "http://test", "--token", "tok", "--json",
            "experiments", "run",
            "--project-id", "p1", "--name", "CI",
            "--model-name", "m", "--model-provider", "openai",
            "--dataset-id", "2", "--metrics", "correctness",
        ])
        # Skip non-JSON lines (status prints)
        lines = mock_stdout.getvalue().strip().split("\n")
        json_start = next(i for i, l in enumerate(lines) if l.strip().startswith("{"))
        data = json.loads("\n".join(lines[json_start:]))
        self.assertTrue(data["passed"])
        self.assertEqual(data["metrics"][0]["name"], "correctness")


class TestCLIDatasetsCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_datasets_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.datasets.list_user.return_value = [
            Dataset(id=1, name="QA Set", path="data/qa.json", prompt_count=50),
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "datasets", "list"])
        output = mock_stdout.getvalue()
        self.assertIn("QA Set", output)
        self.assertIn("50", output)


class TestCLIModelsCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_models_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.models.list.return_value = [
            ModelConfig(id=1, name="GPT", provider="openai", model_name="gpt-4o"),
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "models", "list"])
        output = mock_stdout.getvalue()
        self.assertIn("GPT", output)
        self.assertIn("openai", output)

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_models_create(self, mock_stdout, MockClient):
        client = _mock_client()
        client.models.create.return_value = ModelConfig(id=2, name="Claude", provider="anthropic", model_name="claude-3-5-haiku")
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "models", "create",
              "--name", "Claude", "--provider", "anthropic", "--model-name", "claude-3-5-haiku"])
        self.assertIn("Claude", mock_stdout.getvalue())


class TestCLIMetricsCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_metrics_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.metrics.available.return_value = [
            {"name": "correctness", "requires_context": False},
            {"name": "faithfulness", "requires_context": True},
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "metrics", "list"])
        output = mock_stdout.getvalue()
        self.assertIn("correctness", output)
        self.assertIn("faithfulness", output)
        self.assertIn("requires context", output)


class TestCLIScorersCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_scorers_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.scorers.list.return_value = [
            Scorer(id=1, name="Custom", provider="openai", model="gpt-4o"),
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "scorers", "list"])
        self.assertIn("Custom", mock_stdout.getvalue())


class TestCLIReportsCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_reports_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.reports.list.return_value = [
            Report(id="r1", title="Weekly", format="pdf", file_size=2048),
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "reports", "list"])
        output = mock_stdout.getvalue()
        self.assertIn("Weekly", output)


class TestCLILogsCommands(unittest.TestCase):

    @patch("verifywise.cli.VerifyWiseClient")
    @patch("sys.stdout", new_callable=StringIO)
    def test_logs_list(self, mock_stdout, MockClient):
        client = _mock_client()
        client.logs.list.return_value = [
            {"id": "l1", "status": "success"},
        ]
        MockClient.return_value = client

        main(["--api-url", "http://test", "--token", "tok", "logs", "list"])
        self.assertIn("success", mock_stdout.getvalue())


class TestCLIParserStructure(unittest.TestCase):
    """Verify the parser tree has the expected commands and subcommands."""

    def test_all_commands_registered(self):
        parser = _build_parser()
        choices = set()
        for action in parser._subparsers._actions:
            if hasattr(action, "choices") and action.choices:
                choices.update(action.choices.keys())
        expected = {"config", "projects", "experiments", "datasets", "reports", "metrics", "models", "scorers", "logs"}
        self.assertTrue(expected.issubset(choices), f"Missing commands: {expected - choices}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
