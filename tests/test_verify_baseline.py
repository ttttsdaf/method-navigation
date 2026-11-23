from contextlib import redirect_stdout
import hashlib
from io import StringIO
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import verify_baseline


class BaselineVerificationTests(unittest.TestCase):
    def setUp(self):
        scratch = TemporaryDirectory(prefix="method-baseline-test-")
        self.addCleanup(scratch.cleanup)
        self.repo = Path(scratch.name) / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Acceptance Test")
        self.git("config", "user.email", "fixture@example.test")
        self.git("config", "core.hooksPath", str(Path(scratch.name) / "unused-hooks"))
        self.git("config", "commit.gpgsign", "false")
        self.write("package.json", '{"scripts": {"test:python": "python -B tests/fixture.py"}}')
        self.write("tests/fixture.py", self.assertion("expected"))
        self.write("app/.prettierrc.yml", "singleQuote: true\n")
        self.write("app/value.txt", "expected")
        self.write("app/removed.txt", "base only")
        self.write("serve.py", "# base preview")
        self.write(".github/workflows/quality.yml", "name: baseline\n")
        self.base = self.commit("Reviewed fixture")

    def git(self, *args, data=None):
        return subprocess.run(
            ["git", "--no-replace-objects", *args],
            cwd=self.repo, input=data, capture_output=True, check=True,
        ).stdout

    def write(self, name, text):
        target = self.repo / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def commit(self, message):
        self.git("add", "--all")
        self.git("commit", "-qm", message)
        return self.git("rev-parse", "HEAD").decode().strip()

    def run_verifier(self, mode, *options):
        return subprocess.run(
            [
                sys.executable, "-B", verify_baseline.__file__,
                "--base", self.base, "--head", "HEAD", "--mode", mode, *options,
            ],
            cwd=self.repo, capture_output=True, text=True, encoding="utf-8", check=False,
        )

    @staticmethod
    def assertion(value):
        return (
            "from pathlib import Path\n"
            f"assert Path('app/value.txt').read_text(encoding='utf-8') == {value!r}, "
            "'fixture did not satisfy the reviewed value'\n"
        )

    def test_observe_reports_changed_tests_configuration_and_workflow(self):
        self.write("tests/fixture.py", self.assertion("different"))
        self.write("app/value.txt", "different")
        self.write("app/.prettierrc.yml", "singleQuote: false\n")
        self.write(".gitattributes", "app/value.txt export-ignore\n")
        self.write(".npmrc", "ignore-scripts=false\n")
        self.write("npm-shrinkwrap.json", "{}\n")
        self.write("prettier.config.cjs", "module.exports = {};\n")
        (self.repo / ".github/workflows/quality.yml").unlink()
        head = self.commit("Change fixture contract")

        result = self.run_verifier("observe", "--install-chromium")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual((report["base_sha"], report["head_sha"]), (self.base, head))
        self.assertEqual(report["acceptance_changes"], [
            {"status": "A", "path": ".gitattributes"},
            {"status": "D", "path": ".github/workflows/quality.yml"},
            {"status": "A", "path": ".npmrc"},
            {"status": "M", "path": "app/.prettierrc.yml"},
            {"status": "A", "path": "npm-shrinkwrap.json"},
            {"status": "A", "path": "prettier.config.cjs"},
            {"status": "M", "path": "tests/fixture.py"},
        ])
        self.assertEqual(
            report["baseline_sha256"]["tests/fixture.py"],
            hashlib.sha256(self.git("show", f"{self.base}:tests/fixture.py")).hexdigest(),
        )

    def test_snapshot_keeps_reviewed_tests_and_materializes_only_candidate_runtime(self):
        self.write("tests/fixture.py", self.assertion("different"))
        self.write("tests/extra.py", "# new candidate test")
        self.write("app/.prettierrc.yml", "singleQuote: false\n")
        self.write("app/.npmrc", "ignore-scripts=false\n")
        self.write("content/.editorconfig", "root = true\n")
        self.write("app/value.txt", "different")
        self.write("app/added.txt", "new runtime file")
        self.write(".npmrc", "ignore-scripts=false\n")
        self.write(".gitattributes", "app/added.txt export-ignore\n")
        (self.repo / "app/removed.txt").unlink()
        head = self.commit("Change test and runtime independently")
        output = self.repo.parent / "snapshot"

        with patch.object(verify_baseline, "git", self.git):
            verify_baseline.snapshot(output, verify_baseline.read_tree(self.base), verify_baseline.read_tree(head))

        self.assertEqual(
            (output / "tests/fixture.py").read_bytes(), self.git("show", f"{self.base}:tests/fixture.py"),
        )
        self.assertEqual((output / "app/value.txt").read_text(encoding="utf-8"), "different")
        self.assertIn("singleQuote: true", (output / "app/.prettierrc.yml").read_text(encoding="utf-8"))
        self.assertTrue((output / "app/added.txt").is_file())
        for path in (
            "app/removed.txt", "app/.npmrc", "content/.editorconfig", ".npmrc",
            ".gitattributes", "tests/extra.py",
        ):
            self.assertFalse((output / path).exists(), path)

    def test_snapshot_rejects_selected_link(self):
        oid = self.git("hash-object", "-w", "--stdin", data=b"../package.json").decode().strip()
        self.git("update-index", "--add", "--cacheinfo", f"120000,{oid},app/link")
        self.git("commit", "-qm", "Synthetic linked runtime path")
        head = self.git("rev-parse", "HEAD").decode().strip()
        with patch.object(verify_baseline, "git", self.git):
            with self.assertRaisesRegex(ValueError, "ordinary Git file"):
                verify_baseline.snapshot(
                    self.repo.parent / "snapshot", verify_baseline.read_tree(self.base), verify_baseline.read_tree(head),
                )

    def test_frozen_python_check_rejects_regression_that_candidate_check_accepts(self):
        good = self.run_verifier("python")
        self.assertEqual(good.returncode, 0, good.stdout + good.stderr)
        self.write("app/value.txt", "different")
        self.write("tests/fixture.py", self.assertion("different"))
        self.commit("Synthetic drift in fixture and product")

        candidate_check = subprocess.run([sys.executable, "-B", "tests/fixture.py"], cwd=self.repo, check=False)
        self.assertEqual(candidate_check.returncode, 0)
        baseline_check = self.run_verifier("python")
        self.assertEqual(baseline_check.returncode, 1, baseline_check.stdout + baseline_check.stderr)
        self.assertIn("fixture did not satisfy the reviewed value", baseline_check.stderr)


class BrowserInstallationTests(unittest.TestCase):
    def test_installation_is_opt_in_and_uses_the_frozen_dependency(self):
        suffix = ".cmd" if os.name == "nt" else ""
        npm, npx = f"npm{suffix}", f"npx{suffix}"
        ci = [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"]
        chromium = [npx, "--no-install", "playwright", "install", "--with-deps", "chromium"]
        for mode, install, commands in (
            ("all", True, [ci, chromium, [npm, "run", "check"]]),
            ("browser", True, [ci, chromium, [npm, "run", "test:browser"]]),
            ("browser", False, [ci, [npm, "run", "test:browser"]]),
            ("python", True, [[npm, "run", "test:python"]]),
        ):
            with self.subTest(mode=mode, install=install):
                with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run, redirect_stdout(StringIO()):
                    self.assertEqual(verify_baseline.execute(Path.cwd(), mode, install_chromium=install), 0)
                    self.assertEqual([call.args[0] for call in run.call_args_list], commands)
                    self.assertTrue(all(call.kwargs["cwd"] == Path.cwd() for call in run.call_args_list))


if __name__ == "__main__":
    unittest.main()
