"""Tests for the validate command."""

import os
import textwrap

from click.testing import CliRunner

from strawhub.cli import cli


def _write(tmp_path, name, content):
    path = tmp_path / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content), encoding="utf-8")


class TestValidateSkill:
    def test_valid_skill(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: my-skill
            description: "A test skill"
            ---
            # My Skill
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code == 0
        assert "Valid skill" in result.output

    def test_missing_skill_md(self, tmp_path):
        _write(tmp_path, "README.md", "# Not a skill")
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "Missing required file: SKILL.md" in result.output

    def test_missing_name(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            description: "No name"
            ---
            # Oops
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "Missing 'name' field" in result.output

    def test_missing_description(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: my-skill
            ---
            # No description
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "Missing 'description' field" in result.output

    def test_invalid_slug(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: My_Skill
            description: "Bad slug"
            ---
            # Bad
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "Invalid slug" in result.output

    def test_slug_too_long(self, tmp_path):
        long_slug = "a" * 65
        _write(tmp_path, "SKILL.md", f"""\
            ---
            name: {long_slug}
            description: "Long slug"
            ---
            # Long
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "exceeds 64 characters" in result.output

    def test_invalid_version_format(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: my-skill
            description: "Bad version"
            version: "1.0"
            ---
            # Bad version
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "Invalid version" in result.output

    def test_disallowed_binary_file(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: my-skill
            description: "Has binary"
            ---
            # Skill
        """)
        (tmp_path / "data.bin").write_bytes(b"\x00\x01\x02")
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "disallowed extension" in result.output

    def test_skill_with_allowed_supporting_files(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: my-skill
            description: "Has extras"
            ---
            # Skill
        """)
        _write(tmp_path, "config.json", '{"key": "value"}')
        _write(tmp_path, "data.yaml", "key: value")
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code == 0


class TestValidateRole:
    def test_valid_role(self, tmp_path):
        _write(tmp_path, "ROLE.md", """\
            ---
            name: my-role
            description: "A test role"
            ---
            # My Role
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "role", str(tmp_path)])
        assert result.exit_code == 0

    def test_role_with_extra_files(self, tmp_path):
        _write(tmp_path, "ROLE.md", """\
            ---
            name: my-role
            description: "A test role"
            ---
            # My Role
        """)
        _write(tmp_path, "extra.md", "# Extra")
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "role", str(tmp_path)])
        assert result.exit_code != 0
        assert "exactly one file" in result.output


class TestValidateAgent:
    def test_valid_agent(self, tmp_path):
        _write(tmp_path, "AGENT.md", """\
            ---
            name: my-agent
            description: "A test agent"
            ---
            # My Agent
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "agent", str(tmp_path)])
        assert result.exit_code == 0

    def test_agent_allows_binary_files(self, tmp_path):
        _write(tmp_path, "AGENT.md", """\
            ---
            name: my-agent
            description: "Agent with binary"
            ---
            # Agent
        """)
        (tmp_path / "wrapper").write_bytes(b"\x7fELF" + b"\x00" * 100)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "agent", str(tmp_path)])
        assert result.exit_code == 0


class TestValidateMemory:
    def test_valid_memory(self, tmp_path):
        _write(tmp_path, "MEMORY.md", """\
            ---
            name: my-memory
            description: "A test memory"
            ---
            # My Memory
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "memory", str(tmp_path)])
        assert result.exit_code == 0


class TestValidateIntegration:
    def test_valid_integration(self, tmp_path):
        _write(tmp_path, "INTEGRATION.md", """\
            ---
            name: my-integration
            description: "A test integration"
            ---
            # My Integration
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "integration", str(tmp_path)])
        assert result.exit_code == 0


class TestValidateDependencies:
    def test_valid_skill_deps(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: my-skill
            description: "Skill with deps"
            metadata:
              strawpot:
                dependencies:
                  - other-skill
                  - another-skill
            ---
            # Skill
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code == 0

    def test_invalid_dep_slug(self, tmp_path):
        _write(tmp_path, "SKILL.md", """\
            ---
            name: my-skill
            description: "Bad dep"
            metadata:
              strawpot:
                dependencies:
                  - Invalid_Slug
            ---
            # Skill
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "skill", str(tmp_path)])
        assert result.exit_code != 0
        assert "Invalid dependency slug" in result.output

    def test_wildcard_dep_allowed_for_roles(self, tmp_path):
        _write(tmp_path, "ROLE.md", """\
            ---
            name: my-role
            description: "Role with wildcard"
            metadata:
              strawpot:
                dependencies:
                  roles:
                    - "*"
                  skills:
                    - some-skill
            ---
            # Role
        """)
        runner = CliRunner()
        result = runner.invoke(cli, ["validate", "role", str(tmp_path)])
        assert result.exit_code == 0


class TestValidateNoSubcommand:
    def test_no_subcommand_shows_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["validate"])
        assert result.exit_code != 0
        assert "validate" in result.output
