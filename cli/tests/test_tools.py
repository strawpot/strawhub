"""Tests for system tool dependency management (metadata.strawpot.tools)."""

from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest
from click.testing import CliRunner

from strawhub.tools import (
    detect_os,
    extract_tools,
    parse_tool_specs,
    check_tool_installed,
    run_tool_installs,
    run_tool_installs_for_package,
    run_tool_installs_for_all,
    ToolSpec,
)


# ── detect_os ─────────────────────────────────────────────────────────────────


class TestDetectOs:
    def test_darwin_returns_macos(self):
        with patch("strawhub.tools.platform") as mock_platform:
            mock_platform.system.return_value = "Darwin"
            assert detect_os() == "macos"

    def test_linux_returns_linux(self):
        with patch("strawhub.tools.platform") as mock_platform:
            mock_platform.system.return_value = "Linux"
            assert detect_os() == "linux"

    def test_windows_returns_windows(self):
        with patch("strawhub.tools.platform") as mock_platform:
            mock_platform.system.return_value = "Windows"
            assert detect_os() == "windows"

    def test_unknown_returns_none(self):
        with patch("strawhub.tools.platform") as mock_platform:
            mock_platform.system.return_value = "FreeBSD"
            assert detect_os() is None


# ── extract_tools ─────────────────────────────────────────────────────────────


class TestExtractTools:
    def test_extracts_tools_from_full_frontmatter(self):
        fm = {
            "metadata": {
                "strawpot": {
                    "tools": {
                        "gh": {
                            "description": "GitHub CLI",
                            "install": {
                                "macos": "brew install gh",
                                "linux": "apt install gh",
                            },
                        }
                    }
                }
            }
        }
        result = extract_tools(fm)
        assert result is not None
        assert "gh" in result
        assert result["gh"]["description"] == "GitHub CLI"

    def test_returns_none_when_no_metadata(self):
        assert extract_tools({"name": "test"}) is None

    def test_returns_none_when_no_strawpot(self):
        assert extract_tools({"metadata": {"other": {}}}) is None

    def test_returns_none_when_no_tools(self):
        fm = {"metadata": {"strawpot": {"dependencies": ["a"]}}}
        assert extract_tools(fm) is None

    def test_returns_none_for_empty_tools(self):
        fm = {"metadata": {"strawpot": {"tools": {}}}}
        assert extract_tools(fm) is None

    def test_returns_none_for_non_dict_tools(self):
        fm = {"metadata": {"strawpot": {"tools": "invalid"}}}
        assert extract_tools(fm) is None


# ── parse_tool_specs ──────────────────────────────────────────────────────────


class TestParseToolSpecs:
    def test_parses_matching_os(self):
        tools = {
            "gh": {
                "description": "GitHub CLI",
                "install": {"macos": "brew install gh", "linux": "apt install gh"},
            }
        }
        specs = parse_tool_specs(tools, "macos")
        assert len(specs) == 1
        assert specs[0].name == "gh"
        assert specs[0].description == "GitHub CLI"
        assert specs[0].command == "brew install gh"

    def test_command_none_when_os_not_matched(self):
        tools = {
            "gh": {
                "description": "GitHub CLI",
                "install": {"macos": "brew install gh"},
            }
        }
        specs = parse_tool_specs(tools, "linux")
        assert len(specs) == 1
        assert specs[0].command is None

    def test_multiple_tools_preserves_order(self):
        tools = {
            "gh": {"description": "GitHub CLI", "install": {"macos": "brew install gh"}},
            "docker": {"description": "Docker", "install": {"macos": "brew install docker"}},
        }
        specs = parse_tool_specs(tools, "macos")
        assert len(specs) == 2
        assert specs[0].name == "gh"
        assert specs[1].name == "docker"

    def test_missing_install_block(self):
        tools = {"gh": {"description": "GitHub CLI"}}
        specs = parse_tool_specs(tools, "macos")
        assert len(specs) == 1
        assert specs[0].command is None

    def test_missing_description(self):
        tools = {"gh": {"install": {"macos": "brew install gh"}}}
        specs = parse_tool_specs(tools, "macos")
        assert specs[0].description == ""
        assert specs[0].command == "brew install gh"

    def test_skips_non_dict_config(self):
        tools = {"gh": "invalid"}
        specs = parse_tool_specs(tools, "macos")
        assert len(specs) == 0


# ── check_tool_installed ──────────────────────────────────────────────────────


class TestCheckToolInstalled:
    def test_returns_true_when_found(self):
        with patch("strawhub.tools.shutil.which", return_value="/usr/bin/gh"):
            assert check_tool_installed("gh") is True

    def test_returns_false_when_not_found(self):
        with patch("strawhub.tools.shutil.which", return_value=None):
            assert check_tool_installed("gh") is False


# ── run_tool_installs ─────────────────────────────────────────────────────────


class TestRunToolInstalls:
    TOOLS = {
        "gh": {
            "description": "GitHub CLI",
            "install": {"macos": "brew install gh", "linux": "apt install gh"},
        }
    }

    def test_installs_missing_tool_with_yes(self):
        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=False),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            mock_subprocess.run.return_value = MagicMock(returncode=0)
            results = run_tool_installs(self.TOOLS, yes=True)

        assert len(results) == 1
        assert results[0]["tool"] == "gh"
        assert results[0]["status"] == "installed"
        mock_subprocess.run.assert_called_once_with("brew install gh", shell=True)

    def test_skips_already_installed_tool(self):
        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=True),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            results = run_tool_installs(self.TOOLS, yes=True)

        assert len(results) == 1
        assert results[0]["status"] == "skipped"
        mock_subprocess.run.assert_not_called()

    def test_failed_install_continues(self):
        tools = {
            "gh": {"description": "GitHub CLI", "install": {"macos": "brew install gh"}},
            "docker": {"description": "Docker", "install": {"macos": "brew install docker"}},
        }
        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=False),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            mock_subprocess.run.side_effect = [
                MagicMock(returncode=1),  # gh fails
                MagicMock(returncode=0),  # docker succeeds
            ]
            results = run_tool_installs(tools, yes=True)

        assert len(results) == 2
        assert results[0]["status"] == "failed"
        assert results[1]["status"] == "installed"

    def test_declined_when_not_confirmed(self):
        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=False),
            patch("strawhub.tools.click.confirm", return_value=False),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            results = run_tool_installs(self.TOOLS, yes=False)

        assert len(results) == 1
        assert results[0]["status"] == "declined"
        mock_subprocess.run.assert_not_called()

    def test_no_command_for_os(self):
        tools = {"gh": {"description": "GitHub CLI", "install": {"linux": "apt install gh"}}}
        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
        ):
            results = run_tool_installs(tools, yes=True)

        assert len(results) == 1
        assert results[0]["status"] == "no_command"

    def test_unknown_os_returns_empty(self):
        with patch("strawhub.tools.detect_os", return_value=None):
            results = run_tool_installs(self.TOOLS, yes=True)
        assert results == []

    def test_seen_set_deduplicates(self):
        seen: set[str] = {"gh"}
        with patch("strawhub.tools.detect_os", return_value="macos"):
            results = run_tool_installs(self.TOOLS, yes=True, seen=seen)
        assert results == []

    def test_os_error_handled(self):
        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=False),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            mock_subprocess.run.side_effect = OSError("command not found")
            results = run_tool_installs(self.TOOLS, yes=True)

        assert len(results) == 1
        assert results[0]["status"] == "failed"


# ── run_tool_installs_for_package ─────────────────────────────────────────────


class TestRunToolInstallsForPackage:
    def test_reads_skill_md_and_runs_installs(self, tmp_path):
        pkg_dir = tmp_path / "skills" / "git-workflow-1.0.0"
        pkg_dir.mkdir(parents=True)
        (pkg_dir / "SKILL.md").write_text(
            "---\n"
            "name: git-workflow\n"
            "metadata:\n"
            "  strawpot:\n"
            "    tools:\n"
            "      gh:\n"
            "        description: GitHub CLI\n"
            "        install:\n"
            "          macos: brew install gh\n"
            "---\n\n# Git Workflow\n"
        )

        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=False),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            mock_subprocess.run.return_value = MagicMock(returncode=0)
            results = run_tool_installs_for_package(
                tmp_path, "skill", "git-workflow", "1.0.0", yes=True
            )

        assert len(results) == 1
        assert results[0]["status"] == "installed"

    def test_returns_empty_when_no_tools(self, tmp_path):
        pkg_dir = tmp_path / "skills" / "basic-1.0.0"
        pkg_dir.mkdir(parents=True)
        (pkg_dir / "SKILL.md").write_text(
            "---\nname: basic\n---\n\n# Basic\n"
        )

        results = run_tool_installs_for_package(
            tmp_path, "skill", "basic", "1.0.0", yes=True
        )
        assert results == []

    def test_returns_empty_when_no_file(self, tmp_path):
        results = run_tool_installs_for_package(
            tmp_path, "skill", "missing", "1.0.0", yes=True
        )
        assert results == []

    def test_reads_role_md(self, tmp_path):
        pkg_dir = tmp_path / "roles" / "deployer-1.0.0"
        pkg_dir.mkdir(parents=True)
        (pkg_dir / "ROLE.md").write_text(
            "---\n"
            "name: deployer\n"
            "metadata:\n"
            "  strawpot:\n"
            "    tools:\n"
            "      kubectl:\n"
            "        description: Kubernetes CLI\n"
            "        install:\n"
            "          macos: brew install kubectl\n"
            "---\n\n# Deployer\n"
        )

        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=True),
        ):
            results = run_tool_installs_for_package(
                tmp_path, "role", "deployer", "1.0.0", yes=True
            )

        assert len(results) == 1
        assert results[0]["status"] == "skipped"


# ── run_tool_installs_for_all ─────────────────────────────────────────────────


class TestRunToolInstallsForAll:
    def test_scans_all_packages(self, tmp_path):
        # Create two skill packages
        for slug in ("skill-a", "skill-b"):
            pkg_dir = tmp_path / "skills" / f"{slug}-1.0.0"
            pkg_dir.mkdir(parents=True)
            (pkg_dir / "SKILL.md").write_text(
                f"---\nname: {slug}\n"
                "metadata:\n"
                "  strawpot:\n"
                "    tools:\n"
                f"      {slug}-tool:\n"
                f"        description: Tool for {slug}\n"
                "        install:\n"
                "          macos: echo installed\n"
                "---\n\n# Skill\n"
            )

        lockfile = MagicMock()
        lockfile.packages = {
            "skill:skill-a:1.0.0": {"kind": "skill", "slug": "skill-a", "version": "1.0.0"},
            "skill:skill-b:1.0.0": {"kind": "skill", "slug": "skill-b", "version": "1.0.0"},
        }

        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=False),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            mock_subprocess.run.return_value = MagicMock(returncode=0)
            results = run_tool_installs_for_all(tmp_path, lockfile, yes=True)

        assert len(results) == 2

    def test_deduplicates_across_packages(self, tmp_path):
        # Two packages declaring the same tool
        for slug in ("skill-a", "skill-b"):
            pkg_dir = tmp_path / "skills" / f"{slug}-1.0.0"
            pkg_dir.mkdir(parents=True)
            (pkg_dir / "SKILL.md").write_text(
                f"---\nname: {slug}\n"
                "metadata:\n"
                "  strawpot:\n"
                "    tools:\n"
                "      gh:\n"
                "        description: GitHub CLI\n"
                "        install:\n"
                "          macos: brew install gh\n"
                "---\n\n# Skill\n"
            )

        lockfile = MagicMock()
        lockfile.packages = {
            "skill:skill-a:1.0.0": {"kind": "skill", "slug": "skill-a", "version": "1.0.0"},
            "skill:skill-b:1.0.0": {"kind": "skill", "slug": "skill-b", "version": "1.0.0"},
        }

        with (
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=False),
            patch("strawhub.tools.subprocess") as mock_subprocess,
        ):
            mock_subprocess.run.return_value = MagicMock(returncode=0)
            results = run_tool_installs_for_all(tmp_path, lockfile, yes=True)

        # gh should only be installed once
        installed = [r for r in results if r["status"] == "installed"]
        assert len(installed) == 1


# ── install-tools command ─────────────────────────────────────────────────────


class TestInstallToolsCommand:
    def test_no_packages_shows_error(self):
        from strawhub.cli import cli

        with (
            patch("strawhub.commands.install_tools.get_root", return_value=Path("/tmp/test")),
            patch("strawhub.commands.install_tools.Lockfile") as mock_lockfile_cls,
        ):
            mock_lockfile = MagicMock()
            mock_lockfile.packages = {}
            mock_lockfile_cls.load.return_value = mock_lockfile

            runner = CliRunner()
            result = runner.invoke(cli, ["install-tools", "--yes"])

        assert result.exit_code == 1
        assert "No packages installed" in result.output

    def test_runs_successfully(self, tmp_path):
        from strawhub.cli import cli

        # Create a package with tools
        pkg_dir = tmp_path / "skills" / "test-1.0.0"
        pkg_dir.mkdir(parents=True)
        (pkg_dir / "SKILL.md").write_text(
            "---\nname: test\n"
            "metadata:\n"
            "  strawpot:\n"
            "    tools:\n"
            "      gh:\n"
            "        description: GitHub CLI\n"
            "        install:\n"
            "          macos: brew install gh\n"
            "---\n\n# Test\n"
        )

        with (
            patch("strawhub.commands.install_tools.get_root", return_value=tmp_path),
            patch("strawhub.commands.install_tools.Lockfile") as mock_lockfile_cls,
            patch("strawhub.tools.detect_os", return_value="macos"),
            patch("strawhub.tools.check_tool_installed", return_value=True),
        ):
            mock_lockfile = MagicMock()
            mock_lockfile.packages = {
                "skill:test:1.0.0": {"kind": "skill", "slug": "test", "version": "1.0.0"},
            }
            mock_lockfile_cls.load.return_value = mock_lockfile

            runner = CliRunner()
            result = runner.invoke(cli, ["install-tools", "--yes"])

        assert result.exit_code == 0
        assert "Tool check complete" in result.output
