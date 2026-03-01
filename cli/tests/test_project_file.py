"""Tests for project_file.py — strawpot.toml read/write operations."""

import pytest

from strawhub.project_file import ProjectFile


class TestProjectFileLoad:
    def test_load_nonexistent_returns_empty(self, tmp_path):
        pf = ProjectFile.load(tmp_path / "strawpot.toml")
        assert pf.skills == {}
        assert pf.roles == {}
        assert pf.is_empty

    def test_load_if_exists_returns_none(self, tmp_path):
        assert ProjectFile.load_if_exists(tmp_path / "strawpot.toml") is None

    def test_load_if_exists_returns_pf(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        path.write_text('[skills]\ngit-workflow = "^1.0.0"\n')
        pf = ProjectFile.load_if_exists(path)
        assert pf is not None
        assert pf.skills == {"git-workflow": "^1.0.0"}

    def test_load_skills_and_roles(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        path.write_text(
            '[skills]\n'
            'git-workflow = "^1.0.0"\n'
            'code-review = "==2.1.0"\n'
            '\n'
            '[roles]\n'
            'implementer = "^1.0.0"\n'
        )
        pf = ProjectFile.load(path)
        assert pf.skills == {"git-workflow": "^1.0.0", "code-review": "==2.1.0"}
        assert pf.roles == {"implementer": "^1.0.0"}

    def test_load_star_constraint(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        path.write_text('[skills]\nsecurity-baseline = "*"\n')
        pf = ProjectFile.load(path)
        assert pf.skills == {"security-baseline": "*"}

    def test_load_empty_file(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        path.write_text("")
        pf = ProjectFile.load(path)
        assert pf.is_empty

    def test_load_skills_only(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        path.write_text('[skills]\nfoo = "^1.0.0"\n')
        pf = ProjectFile.load(path)
        assert pf.skills == {"foo": "^1.0.0"}
        assert pf.roles == {}


class TestProjectFileSave:
    def test_save_and_reload(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        pf = ProjectFile(path)
        pf.skills = {"git-workflow": "^1.0.0", "code-review": "==2.1.0"}
        pf.roles = {"implementer": "^1.0.0"}
        pf.save()

        pf2 = ProjectFile.load(path)
        assert pf2.skills == pf.skills
        assert pf2.roles == pf.roles

    def test_save_format(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        pf = ProjectFile(path)
        pf.skills = {"b-skill": "^2.0.0", "a-skill": "==1.0.0"}
        pf.roles = {"my-role": ">=3.0.0"}
        pf.save()

        content = path.read_text()
        assert "[skills]" in content
        assert '[roles]' in content
        # Skills should be sorted alphabetically
        lines = content.strip().split("\n")
        skill_lines = [l for l in lines if "skill" in l and "=" in l]
        assert skill_lines[0].startswith("a-skill")
        assert skill_lines[1].startswith("b-skill")

    def test_save_empty(self, tmp_path):
        path = tmp_path / "strawpot.toml"
        pf = ProjectFile(path)
        pf.save()
        assert path.read_text() == ""


class TestProjectFileDependencies:
    def test_add_dependency_caret(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.add_dependency("skill", "git-workflow", "1.0.0")
        assert pf.skills == {"git-workflow": "^1.0.0"}

    def test_add_dependency_exact(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.add_dependency("skill", "git-workflow", "1.0.0", exact=True)
        assert pf.skills == {"git-workflow": "==1.0.0"}

    def test_add_dependency_role(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.add_dependency("role", "implementer", "2.0.0")
        assert pf.roles == {"implementer": "^2.0.0"}

    def test_overwrite_existing(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.add_dependency("skill", "foo", "1.0.0")
        pf.add_dependency("skill", "foo", "2.0.0", exact=True)
        assert pf.skills == {"foo": "==2.0.0"}

    def test_remove_dependency(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.skills = {"foo": "^1.0.0", "bar": "==2.0.0"}
        assert pf.remove_dependency("skill", "foo") is True
        assert pf.skills == {"bar": "==2.0.0"}

    def test_remove_nonexistent(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        assert pf.remove_dependency("skill", "nope") is False

    def test_has_dependency(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.skills = {"foo": "^1.0.0"}
        assert pf.has_dependency("skill", "foo") is True
        assert pf.has_dependency("skill", "bar") is False
        assert pf.has_dependency("role", "foo") is False

    def test_get_all_dependencies(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.skills = {"a": "^1.0.0", "b": "==2.0.0"}
        pf.roles = {"r": ">=3.0.0"}
        deps = pf.get_all_dependencies()
        assert ("skill", "a", "^1.0.0") in deps
        assert ("skill", "b", "==2.0.0") in deps
        assert ("role", "r", ">=3.0.0") in deps
        assert len(deps) == 3

    def test_is_empty(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        assert pf.is_empty is True
        pf.add_dependency("skill", "foo", "1.0.0")
        assert pf.is_empty is False

    def test_update_dependency_caret(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.skills = {"foo": "^1.0.0"}
        assert pf.update_dependency("skill", "foo", "1.3.0") is True
        assert pf.skills == {"foo": "^1.3.0"}

    def test_update_dependency_exact(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.skills = {"foo": "==1.0.0"}
        assert pf.update_dependency("skill", "foo", "2.0.0") is True
        assert pf.skills == {"foo": "==2.0.0"}

    def test_update_dependency_gte(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.roles = {"bar": ">=1.0.0"}
        assert pf.update_dependency("role", "bar", "1.5.0") is True
        assert pf.roles == {"bar": ">=1.5.0"}

    def test_update_dependency_star_unchanged(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.skills = {"foo": "*"}
        assert pf.update_dependency("skill", "foo", "3.0.0") is True
        assert pf.skills == {"foo": "*"}

    def test_update_dependency_nonexistent(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        assert pf.update_dependency("skill", "nope", "1.0.0") is False

    def test_get_constraint(self, tmp_path):
        pf = ProjectFile(tmp_path / "strawpot.toml")
        pf.skills = {"foo": "^1.0.0"}
        assert pf.get_constraint("skill", "foo") == "^1.0.0"
        assert pf.get_constraint("skill", "bar") is None
        assert pf.get_constraint("role", "foo") is None
