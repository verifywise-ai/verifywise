import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "grs_debug_sampler.py")

OBLIGATIONS = [f"OBL_{i:03d}" for i in range(1, 6)]
DIMENSIONS = ["authority", "constraint", "ambiguity", "risk", "accountability"]
MUTATION_TYPES = ["urgency", "ambiguity", "authority", "language"]
REQUIRED_FIELDS = {
    "scenario_id", "obligation_id", "source", "scenario_type",
    "primary_dimension", "mutation_type", "prompt",
}
REQUIRED_MANIFEST_KEYS = {
    "grs_version", "sampler_version", "sampling_date", "mode",
    "source_files", "source_hashes", "random_seed_1", "random_seed_2",
    "target_n", "phase1", "phase2", "final_sample", "audit",
}


def make_fixture(source: str, dirpath: str, n_obligations: int = 5) -> str:
    """Generate a synthetic JSONL fixture — n_obligations × 4 scenarios."""
    obligations = [f"OBL_{i:03d}" for i in range(1, n_obligations + 1)]
    path = os.path.join(dirpath, f"{source}_{n_obligations}.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for i, obl in enumerate(obligations):
            dim = DIMENSIONS[i % len(DIMENSIONS)]
            for j in range(4):
                if j == 0:
                    s = {
                        "scenario_id": f"{source}_{obl}_s{j + 1:03d}",
                        "obligation_id": obl,
                        "source": source,
                        "scenario_type": "base",
                        "primary_dimension": dim,
                        "mutation_type": None,
                        "prompt": f"Prompt for {source} {obl} scenario {j + 1}",
                    }
                else:
                    s = {
                        "scenario_id": f"{source}_{obl}_s{j + 1:03d}",
                        "obligation_id": obl,
                        "source": source,
                        "scenario_type": "mutated",
                        "primary_dimension": dim,
                        "mutation_type": MUTATION_TYPES[(j - 1) % len(MUTATION_TYPES)],
                        "prompt": f"Prompt for {source} {obl} scenario {j + 1}",
                    }
                f.write(json.dumps(s) + "\n")
    return path


class SamplerTestBase(unittest.TestCase):
    """Base class: 5-obligation fixtures shared by most tests."""

    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp()
        cls.gpt_path = make_fixture("gpt", cls.tmpdir)
        cls.gemini_path = make_fixture("gemini", cls.tmpdir)
        cls.claude_path = make_fixture("claude", cls.tmpdir)

    def run_sampler(self, seed=42, target_n=30, extra_args=None, out_suffix=""):
        out = os.path.join(self.tmpdir, f"sample{out_suffix}.jsonl")
        manifest = os.path.join(self.tmpdir, f"manifest{out_suffix}.json")
        cmd = [
            sys.executable, SCRIPT,
            "--source-a", self.gpt_path,
            "--source-b", self.gemini_path,
            "--source-c", self.claude_path,
            "--seed", str(seed),
            "--target-n", str(target_n),
            "--output", out,
            "--manifest", manifest,
        ]
        if extra_args:
            cmd.extend(extra_args)
        return subprocess.run(cmd, capture_output=True, text=True), out, manifest

    def load_jsonl(self, path):
        with open(path, encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]

    def load_manifest(self, path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)


class TestHandlesMissingSourceFile(SamplerTestBase):

    def test_handles_missing_source_file(self):  # T14
        out = os.path.join(self.tmpdir, "sample_t14.jsonl")
        manifest = os.path.join(self.tmpdir, "manifest_t14.json")
        cmd = [
            sys.executable, SCRIPT,
            "--source-a", "/nonexistent/path.jsonl",
            "--source-b", self.gemini_path,
            "--source-c", self.claude_path,
            "--output", out,
            "--manifest", manifest,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)


class TestLoadAndOutput(SamplerTestBase):

    def test_all_required_fields_present(self):  # T10
        _, out, _ = self.run_sampler(out_suffix="_t10")
        sample = self.load_jsonl(out)
        self.assertGreater(len(sample), 0, "Output file is empty")
        for s in sample:
            for field in REQUIRED_FIELDS:
                self.assertIn(
                    field, s,
                    f"Field '{field}' missing from scenario {s.get('scenario_id')}",
                )


class TestPhase1(SamplerTestBase):

    def test_all_obligations_represented(self):  # T06
        _, out, _ = self.run_sampler(out_suffix="_t06")
        sample = self.load_jsonl(out)
        obl_ids_in_output = {s["obligation_id"] for s in sample}
        self.assertEqual(obl_ids_in_output, set(OBLIGATIONS))

    def test_phase1_coverage_map_correct(self):  # T07
        _, out, manifest = self.run_sampler(out_suffix="_t07")
        sample = self.load_jsonl(out)
        data = self.load_manifest(manifest)
        output_ids = {s["scenario_id"] for s in sample}
        for obl_id, sid in data["phase1"]["coverage_map"].items():
            self.assertIn(
                sid, output_ids,
                f"Phase 1 coverage_map scenario '{sid}' (obl '{obl_id}') not in output",
            )


class TestPhase2(SamplerTestBase):

    def test_source_balance_within_tolerance(self):  # T08
        _, out, _ = self.run_sampler(out_suffix="_t08")
        sample = self.load_jsonl(out)
        n = len(sample)
        self.assertGreater(n, 0)
        for src in ["gpt", "gemini", "claude"]:
            count = sum(1 for s in sample if s["source"] == src)
            pct = count / n * 100
            self.assertGreaterEqual(pct, 23.0, f"{src} below 23%: {pct:.1f}%")
            self.assertLessEqual(pct, 43.0, f"{src} above 43%: {pct:.1f}%")


class TestPhase1Only(unittest.TestCase):
    """Uses a 15-obligation fixture so target_n == n_obligations is achievable
    within the valid [15, 100] range, making Phase 2 budget exactly 0."""

    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp()
        cls.gpt_path = make_fixture("gpt", cls.tmpdir, n_obligations=15)
        cls.gemini_path = make_fixture("gemini", cls.tmpdir, n_obligations=15)
        cls.claude_path = make_fixture("claude", cls.tmpdir, n_obligations=15)

    def test_phase1_only_when_target_equals_obligations(self):  # T15
        out = os.path.join(self.tmpdir, "sample_t15.jsonl")
        manifest = os.path.join(self.tmpdir, "manifest_t15.json")
        cmd = [
            sys.executable, SCRIPT,
            "--source-a", self.gpt_path,
            "--source-b", self.gemini_path,
            "--source-c", self.claude_path,
            "--seed", "42",
            "--target-n", "15",
            "--output", out,
            "--manifest", manifest,
        ]
        # Exit code not asserted: Phase 1-only may fail source_balance audit (no Phase 2 to rebalance)
        subprocess.run(cmd, capture_output=True, text=True)

        with open(out, encoding="utf-8") as f:
            sample = [json.loads(line) for line in f if line.strip()]
        with open(manifest, encoding="utf-8") as f:
            data = json.load(f)

        expected_obls = {f"OBL_{i:03d}" for i in range(1, 16)}
        actual_obls = {s["obligation_id"] for s in sample}
        self.assertEqual(actual_obls, expected_obls, "Not all 15 obligations covered")
        self.assertEqual(
            data["phase2"]["scenarios_drawn"], 0,
            "Phase 2 should have drawn 0 scenarios when target_n == n_obligations",
        )


class TestOutputIntegrity(SamplerTestBase):

    def test_same_seed_produces_identical_output(self):  # T03
        r1, out1, _ = self.run_sampler(seed=99, out_suffix="_t03a")
        self.assertEqual(r1.returncode, 0, r1.stderr)
        r2, out2, _ = self.run_sampler(seed=99, out_suffix="_t03b")
        self.assertEqual(r2.returncode, 0, r2.stderr)
        with open(out1, "rb") as f1, open(out2, "rb") as f2:
            self.assertEqual(f1.read(), f2.read(), "Identical seeds produced different output")

    def test_different_seed_produces_different_output(self):  # T04
        # Verifies rng1/rng2 = Random(seed)/Random(seed+1) produce distinct draws and shuffle.
        # Relies on fixture having enough scenarios that seeds 1 and 2 produce different output.
        r1, out1, _ = self.run_sampler(seed=1, out_suffix="_t04a")
        self.assertEqual(r1.returncode, 0, r1.stderr)
        r2, out2, _ = self.run_sampler(seed=2, out_suffix="_t04b")
        self.assertEqual(r2.returncode, 0, r2.stderr)
        with open(out1, "rb") as f1, open(out2, "rb") as f2:
            self.assertNotEqual(f1.read(), f2.read(), "Different seeds produced identical output")

    def test_no_duplicate_scenario_ids(self):  # T09
        _, out, _ = self.run_sampler(out_suffix="_t09")
        sample = self.load_jsonl(out)
        ids = [s["scenario_id"] for s in sample]
        self.assertEqual(len(ids), len(set(ids)), "Duplicate scenario_id found in output")

    def test_sample_size_within_target_range(self):  # T11
        _, out, _ = self.run_sampler(target_n=30, out_suffix="_t11")
        sample = self.load_jsonl(out)
        self.assertGreaterEqual(
            len(sample), len(OBLIGATIONS),
            f"Sample smaller than n_obligations ({len(OBLIGATIONS)})",
        )
        self.assertLessEqual(len(sample), 30, "Sample exceeds target_n")


class TestAuditAndManifest(SamplerTestBase):

    def test_exits_zero_on_valid_input(self):  # T01
        result, _, _ = self.run_sampler(out_suffix="_t01")
        self.assertEqual(result.returncode, 0, f"Unexpected exit code. stderr:\n{result.stderr}")

    def test_output_and_manifest_created(self):  # T02
        _, out, manifest = self.run_sampler(out_suffix="_t02")
        self.assertTrue(os.path.exists(out), "Output JSONL file was not created")
        self.assertTrue(os.path.exists(manifest), "Manifest JSON file was not created")

    def test_manifest_hash_matches_output_file(self):  # T05
        _, out, manifest = self.run_sampler(out_suffix="_t05")
        data = self.load_manifest(manifest)
        h = hashlib.sha256()
        with open(out, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        self.assertEqual(
            data["final_sample"]["sha256"], h.hexdigest(),
            "Manifest sha256 does not match actual output file hash",
        )

    def test_manifest_has_required_keys(self):  # T12
        _, _, manifest = self.run_sampler(out_suffix="_t12")
        data = self.load_manifest(manifest)
        for key in REQUIRED_MANIFEST_KEYS:
            self.assertIn(key, data, f"Manifest missing top-level key '{key}'")

    def test_manifest_seed2_equals_seed1_plus_one(self):  # T13
        _, _, manifest = self.run_sampler(out_suffix="_t13")
        data = self.load_manifest(manifest)
        self.assertEqual(
            data["random_seed_2"], data["random_seed_1"] + 1,
            "random_seed_2 must equal random_seed_1 + 1",
        )


if __name__ == "__main__":
    unittest.main()
