"""Tests for CLI commands: info --json/--file, search --json, list --json, whoami --json."""

import json
from unittest.mock import MagicMock, patch

from click.testing import CliRunner

from strawhub.cli import cli


# ── info --json ──────────────────────────────────────────────────────────────


class TestInfoJson:
    def _mock_client(self, detail):
        mock = MagicMock()
        mock.get_info.return_value = ("skill", detail)
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)
        return mock

    def test_info_json_output(self):
        detail = {"slug": "test", "displayName": "Test", "stats": {"downloads": 10}}
        mock = self._mock_client(detail)

        with patch("strawhub.commands.info.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["info", "skill", "test", "--json"])

        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert parsed["slug"] == "test"

    def test_info_file_output(self):
        mock = MagicMock()
        mock.get_info.return_value = ("skill", {"slug": "test"})
        mock.get_skill_file.return_value = "# Test Skill\nHello world"
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.info.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["info", "skill", "test", "--file", "SKILL.md"])

        assert result.exit_code == 0
        assert "Hello world" in result.output
        mock.get_skill_file.assert_called_once_with("test", path="SKILL.md")


# ── search --json ────────────────────────────────────────────────────────────


class TestSearchJson:
    def test_search_json_output(self):
        data = {"results": [{"slug": "a", "kind": "skill"}], "count": 1}
        mock = MagicMock()
        mock.search.return_value = data
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.search.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["search", "test", "--json"])

        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert parsed["count"] == 1


# ── list --json ──────────────────────────────────────────────────────────────


class TestListJson:
    def test_list_json_output(self):
        mock = MagicMock()
        mock.list_skills.return_value = {"items": [{"slug": "s1"}]}
        mock.list_roles.return_value = {"items": [{"slug": "r1"}]}
        mock.list_agents.return_value = {"items": [{"slug": "a1"}]}
        mock.list_memories.return_value = {"items": [{"slug": "m1"}]}
        mock.list_integrations.return_value = {"items": [{"slug": "i1"}]}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.list.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["list", "--json"])

        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert "skills" in parsed
        assert "roles" in parsed


# ── whoami --json ────────────────────────────────────────────────────────────


class TestWhoamiJson:
    def test_whoami_json_output(self):
        user = {"handle": "test", "displayName": "Test User", "email": "t@t.com", "role": "user"}
        mock = MagicMock()
        mock.token = "sh_test"
        mock.whoami.return_value = user
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.whoami.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["whoami", "--json"])

        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert parsed["handle"] == "test"


# ── star / unstar ────────────────────────────────────────────────────────────


class TestStar:
    def test_star_success(self):
        mock = MagicMock()
        mock.token = "sh_test"
        mock.get_info.return_value = ("skill", {"slug": "test"})
        mock.toggle_star.return_value = {"starred": True}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.star.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["star", "skill", "test"])

        assert result.exit_code == 0
        assert "Starred" in result.output

    def test_unstar_success(self):
        mock = MagicMock()
        mock.token = "sh_test"
        mock.toggle_star.return_value = {"starred": False}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.star.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["unstar", "skill", "test"])

        assert result.exit_code == 0
        assert "Unstarred" in result.output

    def test_star_not_logged_in(self):
        mock = MagicMock()
        mock.token = None
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.star.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["star", "skill", "test"])

        assert result.exit_code == 1
        assert "Not logged in" in result.output


# ── delete ───────────────────────────────────────────────────────────────────


class TestDelete:
    def test_delete_with_confirmation(self):
        mock = MagicMock()
        mock.token = "sh_test"
        mock.delete_package.return_value = {"ok": True}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.delete.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["delete", "skill", "test", "--yes"])

        assert result.exit_code == 0
        assert "Deleted" in result.output

    def test_delete_not_logged_in(self):
        mock = MagicMock()
        mock.token = None
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.delete.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["delete", "skill", "test", "--yes"])

        assert result.exit_code == 1
        assert "Not logged in" in result.output


# ── ban-user / set-role ──────────────────────────────────────────────────────


class TestAdmin:
    def test_ban_user(self):
        mock = MagicMock()
        mock.token = "sh_test"
        mock.ban_user.return_value = {"ok": True}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.ban_user.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["ban-user", "baduser", "--reason", "spam"])

        assert result.exit_code == 0
        assert "Banned" in result.output
        mock.ban_user.assert_called_once_with("baduser", blocked=True, reason="spam")

    def test_unban_user(self):
        mock = MagicMock()
        mock.token = "sh_test"
        mock.ban_user.return_value = {"ok": True}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.ban_user.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["ban-user", "baduser", "--unban"])

        assert result.exit_code == 0
        assert "Unbanned" in result.output
        mock.ban_user.assert_called_once_with("baduser", blocked=False)

    def test_set_role(self):
        mock = MagicMock()
        mock.token = "sh_test"
        mock.set_user_role.return_value = {"ok": True}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)

        with patch("strawhub.commands.set_role.StrawHubClient", return_value=mock):
            runner = CliRunner()
            result = runner.invoke(cli, ["set-role", "someuser", "moderator"])

        assert result.exit_code == 0
        assert "Set role" in result.output
        mock.set_user_role.assert_called_once_with("someuser", "moderator")


# ── search --query alias ────────────────────────────────────────────────────


class TestSearchQueryAlias:
    def _mock_client(self, data):
        mock = MagicMock()
        mock.search.return_value = data
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)
        return mock

    def test_search_positional_query(self):
        data = {"results": [{"slug": "a", "kind": "skill"}], "count": 1}
        mock = self._mock_client(data)
        with patch("strawhub.commands.search.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["search", "code-reviewer", "--json"])
        assert result.exit_code == 0
        mock.search.assert_called_once_with("code-reviewer", kind="all", limit=20)

    def test_search_option_query(self):
        data = {"results": [{"slug": "a", "kind": "skill"}], "count": 1}
        mock = self._mock_client(data)
        with patch("strawhub.commands.search.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["search", "--query", "code-reviewer", "--json"])
        assert result.exit_code == 0
        mock.search.assert_called_once_with("code-reviewer", kind="all", limit=20)

    def test_search_positional_wins_over_option(self):
        """When both positional and --query are given, positional takes precedence."""
        data = {"results": [], "count": 0}
        mock = self._mock_client(data)
        with patch("strawhub.commands.search.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["search", "positional-val", "--query", "option-val"])
        assert result.exit_code == 0
        mock.search.assert_called_once_with("positional-val", kind="all", limit=20)

    def test_search_no_query_error(self):
        result = CliRunner().invoke(cli, ["search"])
        assert result.exit_code != 0
        assert "Missing search query" in result.output

    def test_search_with_kind(self):
        data = {"results": [{"slug": "a", "kind": "role"}], "count": 1}
        mock = self._mock_client(data)
        with patch("strawhub.commands.search.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["search", "--query", "reviewer", "--kind", "role", "--json"])
        assert result.exit_code == 0
        mock.search.assert_called_once_with("reviewer", kind="role", limit=20)


# ── list positional filter ──────────────────────────────────────────────────


class TestListPositionalFilter:
    def _mock_client(self):
        mock = MagicMock()
        mock.list_skills.return_value = {"items": [{"slug": "s1"}]}
        mock.list_roles.return_value = {"items": [{"slug": "r1"}]}
        mock.list_agents.return_value = {"items": [{"slug": "a1"}]}
        mock.list_memories.return_value = {"items": [{"slug": "m1"}]}
        mock.list_integrations.return_value = {"items": [{"slug": "i1"}]}
        mock.__enter__ = MagicMock(return_value=mock)
        mock.__exit__ = MagicMock(return_value=False)
        return mock

    def test_list_positional_roles(self):
        mock = self._mock_client()
        with patch("strawhub.commands.list.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["list", "roles", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert "roles" in parsed
        assert "skills" not in parsed

    def test_list_positional_skills(self):
        mock = self._mock_client()
        with patch("strawhub.commands.list.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["list", "skills", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert "skills" in parsed
        assert "roles" not in parsed

    def test_list_kind_option_still_works(self):
        mock = self._mock_client()
        with patch("strawhub.commands.list.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["list", "--kind", "roles", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert "roles" in parsed
        assert "skills" not in parsed

    def test_list_no_filter_defaults_to_all(self):
        mock = self._mock_client()
        with patch("strawhub.commands.list.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["list", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert "skills" in parsed
        assert "roles" in parsed

    def test_list_invalid_filter(self):
        result = CliRunner().invoke(cli, ["list", "foobar"])
        assert result.exit_code != 0
        assert "Unknown resource type" in result.output
        assert "roles" in result.output

    def test_list_conflicting_kind(self):
        result = CliRunner().invoke(cli, ["list", "roles", "--kind", "skills"])
        assert result.exit_code != 0
        assert "Conflicting" in result.output

    def test_list_matching_positional_and_kind(self):
        """When positional and --kind agree, no error."""
        mock = self._mock_client()
        with patch("strawhub.commands.list.StrawHubClient", return_value=mock):
            result = CliRunner().invoke(cli, ["list", "roles", "--kind", "roles", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert "roles" in parsed
