"""Tests for resolver.py — runtime dependency path selector."""

import pytest

from strawhub.errors import DependencyError
from strawhub.resolver import resolve


class TestResolveBasic:
    def test_resolve_skill_no_deps(self, strawpot_dir, make_skill):
        make_skill("git-workflow", "1.0.0")
        result = resolve(
            "git-workflow", kind="skill",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        assert result["slug"] == "git-workflow"
        assert result["kind"] == "skill"
        assert result["version"] == "1.0.0"
        assert result["dependencies"] == []

    def test_resolve_skill_with_deps(self, strawpot_dir, make_skill):
        make_skill("security-baseline", "1.0.0")
        make_skill("code-review", "1.0.0", deps=["security-baseline"])
        result = resolve(
            "code-review", kind="skill",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        assert result["slug"] == "code-review"
        dep_slugs = {d["slug"] for d in result["dependencies"]}
        assert dep_slugs == {"security-baseline"}

    def test_resolve_role_with_skill_deps(self, strawpot_dir, make_skill, make_role):
        make_skill("git-workflow", "1.0.0")
        make_skill("code-review", "1.0.0")
        make_role("implementer", "1.0.0", skill_deps=["git-workflow", "code-review"])

        result = resolve(
            "implementer", kind="role",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        assert result["slug"] == "implementer"
        dep_slugs = {d["slug"] for d in result["dependencies"]}
        assert dep_slugs == {"git-workflow", "code-review"}

    def test_resolve_transitive(self, strawpot_dir, make_skill, make_role):
        """Role → skill → skill (transitive)."""
        make_skill("security-baseline", "1.0.0")
        make_skill("code-review", "1.0.0", deps=["security-baseline"])
        make_role("reviewer", "1.0.0", skill_deps=["code-review"])

        result = resolve(
            "reviewer", kind="role",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        dep_slugs = {d["slug"] for d in result["dependencies"]}
        assert dep_slugs == {"code-review", "security-baseline"}


class TestResolveMultiVersion:
    def test_picks_highest_version(self, strawpot_dir, make_skill):
        make_skill("git-workflow", "1.0.0")
        make_skill("git-workflow", "1.4.0")
        make_skill("git-workflow", "2.0.0")

        result = resolve(
            "git-workflow", kind="skill",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        assert result["version"] == "2.0.0"

    def test_caret_constraint(self, strawpot_dir, make_skill, make_role):
        """^1.0.0 should pick 1.4.0, not 2.0.0."""
        make_skill("git-workflow", "1.0.0")
        make_skill("git-workflow", "1.4.0")
        make_skill("git-workflow", "2.0.0")
        make_role("implementer", "1.0.0", skill_deps=["git-workflow^1.0.0"])

        result = resolve(
            "implementer", kind="role",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        gw = next(d for d in result["dependencies"] if d["slug"] == "git-workflow")
        assert gw["version"] == "1.4.0"

    def test_gte_constraint(self, strawpot_dir, make_skill, make_role):
        """>=2.0.0 should pick 2.0.0."""
        make_skill("git-workflow", "1.0.0")
        make_skill("git-workflow", "2.0.0")
        make_role("reviewer", "1.0.0", skill_deps=["git-workflow>=2.0.0"])

        result = resolve(
            "reviewer", kind="role",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        gw = next(d for d in result["dependencies"] if d["slug"] == "git-workflow")
        assert gw["version"] == "2.0.0"

    def test_exact_constraint(self, strawpot_dir, make_skill, make_role):
        make_skill("git-workflow", "1.0.0")
        make_skill("git-workflow", "1.4.0")
        make_role("strict", "1.0.0", skill_deps=["git-workflow==1.0.0"])

        result = resolve(
            "strict", kind="role",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        gw = next(d for d in result["dependencies"] if d["slug"] == "git-workflow")
        assert gw["version"] == "1.0.0"

    def test_resolve_specific_version(self, strawpot_dir, make_skill):
        make_skill("git-workflow", "1.0.0")
        make_skill("git-workflow", "2.0.0")

        result = resolve(
            "git-workflow", kind="skill", version="1.0.0",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        assert result["version"] == "1.0.0"


class TestResolveCrossScope:
    def test_local_and_global(self, tmp_path):
        local = tmp_path / "local"
        glob = tmp_path / "global"

        # v1.0.0 in global
        d = glob / "skills" / "git-workflow-1.0.0"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            '---\nname: git-workflow\ndescription: "v1"\n---\n# GW\n'
        )

        # v1.2.0 in local
        d = local / "skills" / "git-workflow-1.2.0"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            '---\nname: git-workflow\ndescription: "v1.2"\n---\n# GW\n'
        )

        result = resolve(
            "git-workflow", kind="skill",
            local_root=local, global_root=glob,
        )
        # Should pick 1.2.0 (local, higher)
        assert result["version"] == "1.2.0"
        assert result["source"] == "local"

    def test_global_higher_than_local(self, tmp_path):
        local = tmp_path / "local"
        glob = tmp_path / "global"

        d = local / "skills" / "git-workflow-1.0.0"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            '---\nname: git-workflow\ndescription: "v1"\n---\n# GW\n'
        )

        d = glob / "skills" / "git-workflow-2.0.0"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            '---\nname: git-workflow\ndescription: "v2"\n---\n# GW\n'
        )

        result = resolve(
            "git-workflow", kind="skill",
            local_root=local, global_root=glob,
        )
        assert result["version"] == "2.0.0"
        assert result["source"] == "global"


class TestResolveErrors:
    def test_not_installed(self, strawpot_dir):
        with pytest.raises(DependencyError, match="not installed"):
            resolve(
                "nonexistent", kind="skill",
                local_root=strawpot_dir, global_root=strawpot_dir,
            )

    def test_version_not_installed(self, strawpot_dir, make_skill):
        make_skill("git-workflow", "1.0.0")
        with pytest.raises(DependencyError, match="not installed"):
            resolve(
                "git-workflow", kind="skill", version="9.9.9",
                local_root=strawpot_dir, global_root=strawpot_dir,
            )

    def test_no_version_satisfies_constraint(self, strawpot_dir, make_skill, make_role):
        make_skill("git-workflow", "1.0.0")
        make_role("needs-v2", "1.0.0", skill_deps=["git-workflow>=2.0.0"])

        with pytest.raises(DependencyError, match="No installed version"):
            resolve(
                "needs-v2", kind="role",
                local_root=strawpot_dir, global_root=strawpot_dir,
            )

    def test_circular_dependency(self, strawpot_dir):
        """Two skills that depend on each other."""
        d = strawpot_dir / "skills" / "a-1.0.0"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            "---\nname: a\ndescription: \"a\"\nmetadata:\n  strawpot:\n    dependencies:\n      - b\n---\n# A\n"
        )

        d = strawpot_dir / "skills" / "b-1.0.0"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            "---\nname: b\ndescription: \"b\"\nmetadata:\n  strawpot:\n    dependencies:\n      - a\n---\n# B\n"
        )

        with pytest.raises(DependencyError, match="Circular dependency"):
            resolve(
                "a", kind="skill",
                local_root=strawpot_dir, global_root=strawpot_dir,
            )

    def test_kind_required(self, strawpot_dir, make_skill):
        """kind is a required argument."""
        make_skill("git-workflow", "1.0.0")
        with pytest.raises(TypeError):
            resolve(
                "git-workflow",
                local_root=strawpot_dir, global_root=strawpot_dir,
            )


class TestResolveRoleDeps:
    def test_role_depends_on_role(self, strawpot_dir, make_skill, make_role):
        make_skill("code-review", "1.0.0")
        make_role("reviewer", "1.0.0", skill_deps=["code-review"])
        make_role("lead", "1.0.0", role_deps=["reviewer"])

        result = resolve(
            "lead", kind="role",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        dep_slugs = {d["slug"] for d in result["dependencies"]}
        assert dep_slugs == {"reviewer", "code-review"}

    def test_diamond_dependency(self, strawpot_dir, make_skill, make_role):
        """A → B, A → C, B → D, C → D. D should appear once."""
        make_skill("d", "1.0.0")
        make_skill("b", "1.0.0", deps=["d"])
        make_skill("c", "1.0.0", deps=["d"])
        make_role("a", "1.0.0", skill_deps=["b", "c"])

        result = resolve(
            "a", kind="role",
            local_root=strawpot_dir, global_root=strawpot_dir,
        )
        dep_slugs = [d["slug"] for d in result["dependencies"]]
        assert dep_slugs.count("d") == 1
        assert set(dep_slugs) == {"b", "c", "d"}
