"""Tests for the export command."""

from unittest.mock import MagicMock, patch

from click.testing import CliRunner

from strawhub.cli import cli
from strawhub.commands.export import (
    _strip_frontmatter,
    _clean_strawpot_references,
    _build_export,
)


# ── Unit tests for helper functions ───────────────────────────────────────────


class TestStripFrontmatter:
    def test_strips_yaml_frontmatter(self):
        content = "---\nname: test\ndescription: hello\n---\n\n# Test Role\n\nBody here.\n"
        result = _strip_frontmatter(content)
        assert result.startswith("# Test Role")
        assert "---" not in result
        assert "name: test" not in result

    def test_no_frontmatter(self):
        content = "# Just a heading\n\nNo frontmatter here.\n"
        result = _strip_frontmatter(content)
        assert "# Just a heading" in result

    def test_preserves_body_content(self):
        content = "---\nname: x\n---\n\n# Role\n\nParagraph one.\n\nParagraph two.\n"
        result = _strip_frontmatter(content)
        assert "Paragraph one." in result
        assert "Paragraph two." in result


class TestCleanStrawpotReferences:
    def test_replaces_denden_delegation(self):
        content = "Delegate to `implementer` via denden for execution."
        result = _clean_strawpot_references(content)
        assert "denden" not in result
        assert "implementer" in result
        assert "separate session" in result

    def test_removes_denden_usage_lines(self):
        content = (
            "Step 1: Analyze the code.\n"
            "Use denden to delegate work to the reviewer.\n"
            "Step 2: Report results.\n"
        )
        result = _clean_strawpot_references(content)
        assert "Step 1" in result
        assert "Step 2" in result
        assert "Use denden to delegate" not in result

    def test_removes_denden_skill_usage_lines(self):
        content = "Use the denden skill to delegate tasks to other agents.\n"
        result = _clean_strawpot_references(content)
        assert result.strip() == ""

    def test_preserves_non_strawpot_content(self):
        content = "Review code for bugs.\nCheck CLAUDE.md compliance.\n"
        result = _clean_strawpot_references(content)
        assert result == content


class TestBuildExport:
    def test_includes_provenance_header(self):
        result = _build_export(
            "---\nname: test\n---\n\n# Test\n",
            {},
            "test",
            "1.0.0",
        )
        assert "Exported from StrawHub" in result
        assert "test" in result
        assert "1.0.0" in result

    def test_includes_role_body(self):
        result = _build_export(
            "---\nname: test\n---\n\n# Test Role\n\nDo the thing.\n",
            {},
            "test",
            "1.0.0",
        )
        assert "# Test Role" in result
        assert "Do the thing." in result
        assert "name: test" not in result

    def test_inlines_skill_content(self):
        result = _build_export(
            "---\nname: test\n---\n\n# Role\n",
            {"my-skill": "---\nname: my-skill\n---\n\n# My Skill\n\nSkill instructions.\n"},
            "test",
            "1.0.0",
        )
        assert "# My Skill" in result
        assert "Skill instructions." in result
        assert "Inlined skill dependencies" in result

    def test_separates_multiple_skills(self):
        skills = {
            "skill-a": "---\nname: skill-a\n---\n\n# Skill A\n\nContent A.\n",
            "skill-b": "---\nname: skill-b\n---\n\n# Skill B\n\nContent B.\n",
        }
        result = _build_export(
            "---\nname: test\n---\n\n# Role\n",
            skills,
            "test",
            "1.0.0",
        )
        # Both skills present
        assert "# Skill A" in result
        assert "# Skill B" in result
        # Skills should not run together (there should be a blank line between them)
        a_end = result.index("Content A.")
        b_start = result.index("# Skill B")
        between = result[a_end:b_start]
        assert "\n\n" in between

    def test_includes_warning_for_failed_skills(self):
        result = _build_export(
            "---\nname: test\n---\n\n# Role\n",
            {"good": "---\nname: good\n---\n\n# Good\n"},
            "test",
            "1.0.0",
            failed_skills=["bad-skill"],
        )
        assert "WARNING" in result
        assert "bad-skill" in result

    def test_no_skills_section_when_empty(self):
        result = _build_export(
            "---\nname: test\n---\n\n# Role\n",
            {},
            "test",
            "1.0.0",
        )
        assert "Inlined skill dependencies" not in result


# ── CLI integration tests ─────────────────────────────────────────────────────


class TestExportCommand:
    def _mock_client(self, role_content, skill_contents=None):
        mock = MagicMock()
        mock.get_info.return_value = (
            "role",
            {
                "slug": "code-reviewer",
                "latestVersion": {
                    "version": "1.0.0",
                    "files": [{"path": "ROLE.md", "size": 100}],
                },
            },
        )
        mock.get_role_file.return_value = role_content
        if skill_contents:
            mock.get_skill_file.side_effect = lambda slug, **kw: skill_contents[slug]
        mock.track_download.return_value = None
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)
        return mock

    def test_export_to_stdout(self):
        role_content = (
            "---\nname: code-reviewer\nmetadata:\n  strawpot:\n"
            "    dependencies:\n      skills:\n        - code-review\n---\n\n"
            "# Code Reviewer\n\nReview code.\n"
        )
        skill_content = "---\nname: code-review\n---\n\n# Code Review\n\nSkill body.\n"
        mock = self._mock_client(role_content, {"code-review": skill_content})

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["export", "role", "code-reviewer"])

        assert result.exit_code == 0
        assert "# Code Reviewer" in result.output
        assert "# Code Review" in result.output
        assert "name: code-reviewer" not in result.output

    def test_export_to_file(self, tmp_path):
        role_content = "---\nname: test\n---\n\n# Test\n\nBody.\n"
        mock = self._mock_client(role_content)
        out_file = tmp_path / "output.md"

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(
                cli, ["export", "role", "code-reviewer", "-o", str(out_file)]
            )

        assert result.exit_code == 0
        content = out_file.read_text()
        assert "# Test" in content

    def test_export_no_skills_flag(self):
        role_content = (
            "---\nname: test\nmetadata:\n  strawpot:\n"
            "    dependencies:\n      skills:\n        - some-skill\n---\n\n"
            "# Test\n\nBody.\n"
        )
        mock = self._mock_client(role_content)

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(
                cli, ["export", "role", "code-reviewer", "--no-skills"]
            )

        assert result.exit_code == 0
        assert "# Test" in result.output
        # Should not have tried to fetch skills
        mock.get_skill_file.assert_not_called()

    def test_export_not_found(self):
        from strawhub.errors import NotFoundError

        mock = MagicMock()
        mock.get_info.side_effect = NotFoundError("Not found")
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["export", "role", "nonexistent"])

        assert result.exit_code == 1
        assert "not found" in result.output.lower()

    def test_export_no_published_versions(self):
        mock = MagicMock()
        mock.get_info.return_value = ("role", {"slug": "test", "latestVersion": None})
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["export", "role", "test"])

        assert result.exit_code == 1
        assert "no published versions" in result.output.lower()

    def test_export_tracks_download(self):
        role_content = "---\nname: test\n---\n\n# Test\n"
        mock = self._mock_client(role_content)

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            runner.invoke(cli, ["export", "role", "code-reviewer"])

        mock.track_download.assert_called_once_with("role", "code-reviewer", version="1.0.0")

    def test_export_only_supports_role_kind(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["export", "skill", "test"])
        assert result.exit_code != 0

    def test_export_strawhub_error(self):
        from strawhub.errors import StrawHubError

        mock = MagicMock()
        mock.get_info.side_effect = StrawHubError("Connection refused")
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["export", "role", "test"])

        assert result.exit_code == 1
        assert "connection refused" in result.output.lower()

    def test_export_partial_skill_failure(self):
        from strawhub.errors import NotFoundError

        role_content = (
            "---\nname: test\nmetadata:\n  strawpot:\n"
            "    dependencies:\n      skills:\n"
            "        - good-skill\n        - missing-skill\n---\n\n"
            "# Test\n\nBody.\n"
        )
        mock = self._mock_client(role_content)

        def _get_skill(slug, **kw):
            if slug == "good-skill":
                return "---\nname: good-skill\n---\n\n# Good Skill\n\nWorks.\n"
            raise NotFoundError(f"'{slug}' not found")

        mock.get_skill_file.side_effect = _get_skill

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["export", "role", "code-reviewer"])

        assert result.exit_code == 0
        assert "# Good Skill" in result.output
        assert "missing-skill" not in result.output or "WARNING" in result.output
        # Should include a warning comment about the failed skill
        assert "WARNING" in result.output
        assert "missing-skill" in result.output

    def test_export_malformed_latest_version(self):
        """latestVersion is a dict but missing 'version' key."""
        mock = MagicMock()
        mock.get_info.return_value = (
            "role",
            {"slug": "test", "latestVersion": {"publishedAt": 12345}},
        )
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.export.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["export", "role", "test"])

        assert result.exit_code == 1
        assert "no published versions" in result.output.lower()
