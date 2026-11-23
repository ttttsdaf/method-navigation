"""Run reviewed acceptance tests against a candidate commit's runtime files."""

import argparse
import hashlib
from itertools import chain
import json
import ntpath
import os
from pathlib import Path, PureWindowsPath
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory


SCRIPT_EXTENSIONS = ("js", "mjs", "cjs", "ts", "mts", "cts")
TEST_CONFIG = {
    ".editorconfig", ".gitignore", ".prettierignore", ".prettierrc", "eslint-suppressions.json",
    "package.json", "package.yaml", "package-lock.json", "npm-shrinkwrap.json",
} | {
    f"{stem}.{suffix}"
    for stem in ("prettier.config", "eslint.config", "playwright.config")
    for suffix in SCRIPT_EXTENSIONS
} | {
    f".prettierrc.{suffix}" for suffix in (*SCRIPT_EXTENSIONS, "json", "json5", "toml", "yml", "yaml")
}
OBSERVE_ONLY = {".gitattributes", ".npmrc"}
CONFIG_NAMES = TEST_CONFIG | OBSERVE_ONLY
RUNNER_FILES = {"quality-diff.mjs", "verify_baseline.py"}
ACCEPTANCE_RULES = {
    ".github/CODEOWNERS", "AGENTS.md", "CODEOWNERS", "CONTRIBUTING.md", "REVIEW.md",
}
RUNTIME_FILES = {"serve.py", "start-preview.cmd", "LICENSE", "NOTICE.md"}
RUNTIME_DIRS = ("app/", "content/", "LICENSES/")
RUNTIME_ENV = {
    "APPDATA", "CI", "COMSPEC", "HOME", "HOMEDRIVE", "HOMEPATH", "LANG",
    "LC_ALL", "LOCALAPPDATA", "PATH", "PATHEXT", "PLAYWRIGHT_BROWSERS_PATH",
    "PLAYWRIGHT_CHANNEL", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432",
    "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "USERPROFILE", "WINDIR",
}
IS_RESERVED_PATH = getattr(ntpath, "isreserved", lambda part: PureWindowsPath(part).is_reserved())


def git(*args):
    return subprocess.check_output(["git", "--no-replace-objects", *args])


def resolve(revision):
    return git("rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}").decode().strip()


def read_tree(sha):
    tree = {}
    for record in git("ls-tree", "-rz", sha).split(b"\0"):
        if record:
            metadata, name = record.split(b"\t", 1)
            mode, kind, oid = metadata.decode("ascii").split()
            tree[os.fsdecode(name)] = (mode, kind, oid)
    return tree


def runtime_path(name):
    return name in RUNTIME_FILES or name.startswith(RUNTIME_DIRS)


def acceptance_path(name):
    filename = name.rsplit("/", 1)[-1].casefold()
    in_check_scope = "/" not in name or runtime_path(name)
    return (
        (in_check_scope and filename in CONFIG_NAMES)
        or name in ACCEPTANCE_RULES
        or name in RUNNER_FILES
        or name.startswith(("tests/", ".github/workflows/", ".github/actions/"))
    )


def test_path(name):
    filename = name.rsplit("/", 1)[-1].casefold()
    if filename in OBSERVE_ONLY:
        return False
    return (
        name.startswith("tests/")
        or name in RUNNER_FILES
        or (filename in TEST_CONFIG and acceptance_path(name))
    )


def blob(entry):
    return git("cat-file", "blob", entry[2])


def manifest(base_sha, head_sha, base_tree, head_tree):
    changes = []
    for name in sorted(base_tree.keys() | head_tree.keys()):
        if acceptance_path(name) and base_tree.get(name) != head_tree.get(name):
            status = "A" if name not in base_tree else "D" if name not in head_tree else "M"
            changes.append({"status": status, "path": name})
    return {
        "base_sha": base_sha,
        "head_sha": head_sha,
        "acceptance_changes": changes,
        "baseline_sha256": {
            name: hashlib.sha256(blob(entry)).hexdigest()
            for name, entry in sorted(base_tree.items())
            if acceptance_path(name) and entry[1] == "blob"
        },
    }


def snapshot(root, base_tree, head_tree):
    entries = {name: entry for name, entry in base_tree.items() if test_path(name)}
    entries.update({
        name: entry for name, entry in head_tree.items()
        if runtime_path(name) and not acceptance_path(name)
    })
    for name, entry in sorted(entries.items()):
        parts = name.split("/")
        if any(
            not part or part in {".", ".."}
            or re.search(r'[<>:"\\|?*\x00-\x1f]', part)
            or IS_RESERVED_PATH(part)
            for part in parts
        ):
            raise ValueError(f"Unsafe path in selected Git tree: {name!r}")
        if entry[0] not in {"100644", "100755"} or entry[1] != "blob":
            raise ValueError(f"Expected an ordinary Git file: {name!r}")
        destination = root.joinpath(*parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as output:
            output.write(blob(entry))
        if entry[0] == "100755":
            destination.chmod(0o755)


def execute(root, mode, install_chromium=False):
    # Use a fresh install and an empty npm configuration. The lock file comes from base.
    runtime_env = {key: value for key, value in os.environ.items() if key.upper() in RUNTIME_ENV}
    runtime_env["PATH"] = str(Path(sys.executable).parent) + os.pathsep + runtime_env.get("PATH", "")
    runtime_env["PYTHON"] = sys.executable
    runtime_env["PYTHONUTF8"] = "1"
    runtime_env["NPM_CONFIG_CACHE"] = str(root / ".npm-cache")
    runtime_env["NPM_CONFIG_USERCONFIG"] = str(root / ".baseline-user-npmrc")
    runtime_env["NPM_CONFIG_GLOBALCONFIG"] = str(root / ".baseline-global-npmrc")

    npm = "npm.cmd" if os.name == "nt" else "npm"
    task = {"all": "check", "browser": "test:browser", "python": "test:python"}[mode]
    commands = []
    if mode != "python":
        commands.append([npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"])
        if install_chromium:
            npx = "npx.cmd" if os.name == "nt" else "npx"
            commands.append([npx, "--no-install", "playwright", "install", "--with-deps", "chromium"])
    commands.append([npm, "run", task])
    for command in commands:
        print("Baseline command:", " ".join(command), flush=True)
        result = subprocess.run(command, cwd=root, env=runtime_env, check=False)
        if result.returncode:
            return result.returncode
    return 0


def save_browser_evidence(root, artifacts):
    results = root / "test-results"
    if not results.exists():
        return
    for path in chain((results,), results.rglob("*")):
        if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
            raise ValueError(f"Unexpected link in browser evidence: {path.name}")
        if not (path.is_file() or path.is_dir()):
            raise ValueError(f"Expected an ordinary browser result: {path.name}")
    artifacts.mkdir(parents=True, exist_ok=True)
    shutil.copytree(results, artifacts / "test-results")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--mode", choices=("observe", "changed", "all", "browser", "python"), required=True)
    parser.add_argument("--artifacts", type=Path)
    parser.add_argument(
        "--install-chromium", action="store_true",
        help="Install Chromium and system dependencies with the locked Playwright before browser checks.",
    )
    args = parser.parse_args(argv)
    artifacts = args.artifacts.resolve() if args.artifacts else None

    try:
        base, head = resolve(args.base), resolve(args.head)
        base_tree, head_tree = read_tree(base), read_tree(head)
        report = manifest(base, head, base_tree, head_tree)
        print(json.dumps(report, indent=2), flush=True)
        if args.mode == "observe":
            return 0
        if args.mode == "changed" and not report["acceptance_changes"]:
            print("Frozen acceptance execution skipped because the acceptance files are unchanged.")
            return 0
        mode = "all" if args.mode == "changed" else args.mode
        with TemporaryDirectory(prefix="method-acceptance-") as directory:
            root = Path(directory)
            snapshot(root, base_tree, head_tree)
            result = execute(root, mode, install_chromium=args.install_chromium)
            if result and artifacts:
                save_browser_evidence(root, artifacts)
            return result
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Baseline verification could not complete: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
