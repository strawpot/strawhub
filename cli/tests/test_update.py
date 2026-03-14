"""Tests for strawhub.commands.update."""

from unittest.mock import patch, MagicMock, call

import pytest

from strawhub.commands.update import _update_all_impl, _update_one_impl


class TestUpdateOneImpl:
    @patch("strawhub.commands.update._install_impl")
    def test_calls_install_with_update_flag(self, mock_install):
        _update_one_impl("my-skill", kind="skill", is_global=False)
        mock_install.assert_called_once_with(
            "my-skill",
            kind="skill",
            is_global=False,
            skip_tools=False,
            yes=False,
            update=True,
        )

    @patch("strawhub.commands.update._install_impl")
    def test_passes_skip_tools_and_yes(self, mock_install):
        _update_one_impl(
            "my-skill", kind="skill", is_global=False, skip_tools=True, yes=True
        )
        mock_install.assert_called_once_with(
            "my-skill",
            kind="skill",
            is_global=False,
            skip_tools=True,
            yes=True,
            update=True,
        )

    def test_root_and_global_conflict(self):
        with patch("strawhub.paths._local_root_override", "/tmp/x"):
            with pytest.raises(SystemExit):
                _update_one_impl("x", kind="skill", is_global=True)

    def test_save_and_global_conflict(self):
        with pytest.raises(SystemExit):
            _update_one_impl("x", kind="skill", is_global=True, save=True)


class TestUpdateAllImpl:
    @patch("strawhub.commands.update._install_impl")
    @patch("strawhub.commands.update.Lockfile")
    @patch("strawhub.commands.update.get_lockfile_path")
    @patch("strawhub.commands.update.get_root")
    def test_updates_all_direct_installs(
        self, mock_root, mock_lf_path, mock_lockfile_cls, mock_install, tmp_path
    ):
        from strawhub.lockfile import PackageRef

        mock_root.return_value = tmp_path
        mock_lf_path.return_value = tmp_path / "strawpot.lock"

        lockfile = MagicMock()
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="foo", version="1.0.0"),
            PackageRef(kind="role", slug="bar", version="2.0.0"),
        ]
        mock_lockfile_cls.load.return_value = lockfile

        _update_all_impl(is_global=False)

        assert mock_install.call_count == 2
        mock_install.assert_any_call(
            "foo", kind="skill", is_global=False, skip_tools=False, yes=False, update=True,
        )
        mock_install.assert_any_call(
            "bar", kind="role", is_global=False, skip_tools=False, yes=False, update=True,
        )

    @patch("strawhub.commands.update.Lockfile")
    @patch("strawhub.commands.update.get_lockfile_path")
    @patch("strawhub.commands.update.get_root")
    def test_error_when_no_packages(
        self, mock_root, mock_lf_path, mock_lockfile_cls, tmp_path
    ):
        mock_root.return_value = tmp_path
        mock_lf_path.return_value = tmp_path / "strawpot.lock"

        lockfile = MagicMock()
        lockfile.direct_installs = []
        mock_lockfile_cls.load.return_value = lockfile

        with pytest.raises(SystemExit):
            _update_all_impl(is_global=False)

    def test_root_and_global_conflict(self):
        with patch("strawhub.paths._local_root_override", "/tmp/x"):
            with pytest.raises(SystemExit):
                _update_all_impl(is_global=True)
