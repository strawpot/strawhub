"""Shared fixtures for strawhub CLI tests."""

import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def tmp_root(tmp_path):
    """A temporary .strawpot root directory."""
    return tmp_path


@pytest.fixture
def strawpot_dir(tmp_path):
    """A temporary .strawpot directory with skills/ and roles/ subdirs created."""
    root = tmp_path / ".strawpot"
    (root / "skills").mkdir(parents=True)
    (root / "roles").mkdir(parents=True)
    return root


@pytest.fixture
def make_skill(strawpot_dir):
    """Factory fixture to create a skill directory with SKILL.md."""

    def _make(slug, version, deps=None):
        d = strawpot_dir / "skills" / f"{slug}-{version}"
        d.mkdir(parents=True, exist_ok=True)

        dep_section = ""
        if deps:
            dep_lines = "\n".join(f"  - {d}" for d in deps)
            dep_section = f"dependencies:\n{dep_lines}\n"

        (d / "SKILL.md").write_text(
            f"---\nname: {slug}\ndescription: \"{slug} skill\"\n{dep_section}---\n\n# {slug}\n"
        )
        return d

    return _make


@pytest.fixture
def make_role(strawpot_dir):
    """Factory fixture to create a role directory with ROLE.md."""

    def _make(slug, version, skill_deps=None, role_deps=None):
        d = strawpot_dir / "roles" / f"{slug}-{version}"
        d.mkdir(parents=True, exist_ok=True)

        dep_section = ""
        if skill_deps or role_deps:
            dep_section = "dependencies:\n"
            if skill_deps:
                dep_section += "  skills:\n"
                dep_section += "".join(f"    - {s}\n" for s in skill_deps)
            if role_deps:
                dep_section += "  roles:\n"
                dep_section += "".join(f"    - {r}\n" for r in role_deps)

        (d / "ROLE.md").write_text(
            f"---\nname: {slug}\ndescription: \"{slug} role\"\n{dep_section}---\n\n# {slug}\n"
        )
        return d

    return _make


@pytest.fixture
def env_strawpot_home(tmp_path):
    """Set STRAWPOT_HOME env var to a temp directory, restore on teardown."""
    old = os.environ.get("STRAWPOT_HOME")
    os.environ["STRAWPOT_HOME"] = str(tmp_path / "global_strawpot")
    yield tmp_path / "global_strawpot"
    if old is None:
        os.environ.pop("STRAWPOT_HOME", None)
    else:
        os.environ["STRAWPOT_HOME"] = old
