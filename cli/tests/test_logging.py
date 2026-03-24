"""Tests for strawhub.logging — persistent operation logging."""

import logging
from unittest.mock import patch

import pytest

from strawhub.logging import (
    get_logger,
    log_exception,
    log_operation,
    reset_logger,
)


@pytest.fixture(autouse=True)
def _clean_logger():
    """Reset the cached logger before and after every test."""
    reset_logger()
    yield
    reset_logger()


def _flush_handlers() -> None:
    """Flush all handlers on the shared logger so log files are readable."""
    for h in get_logger().handlers:
        h.flush()


class TestGetLogger:
    def test_creates_log_file(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            logger = get_logger()
            logger.info("hello")
            _flush_handlers()

        log_file = tmp_path / "logs" / "operations.log"
        assert log_file.exists()
        assert "hello" in log_file.read_text(encoding="utf-8")

    def test_creates_log_directory(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            get_logger()
        assert (tmp_path / "logs").is_dir()

    def test_returns_same_instance(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            a = get_logger()
            b = get_logger()
        assert a is b

    def test_falls_back_to_null_handler_on_os_error(self, tmp_path):
        """If log directory cannot be created, a NullHandler is used."""
        # Place a regular file where the logger expects to create a directory.
        bad_root = tmp_path / "bad"
        bad_root.mkdir()
        (bad_root / "logs").write_text("block")

        with patch("strawhub.logging.get_global_root", return_value=bad_root):
            logger = get_logger()
        # Should still work (NullHandler) — no exception.
        logger.info("this goes nowhere")
        assert len(logger.handlers) == 1
        assert isinstance(logger.handlers[0], logging.NullHandler)


class TestLogOperation:
    def test_success_entry(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            log_operation(
                operation="install",
                kind="skill",
                slug="git-workflow",
                version="1.0.0",
                status="success",
            )
            _flush_handlers()

        content = (tmp_path / "logs" / "operations.log").read_text(encoding="utf-8")
        assert "op=install" in content
        assert "kind=skill" in content
        assert "slug=git-workflow" in content
        assert "v1.0.0" in content
        assert "status=success" in content
        assert "INFO" in content

    def test_failure_entry_with_error(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            log_operation(
                operation="install",
                kind="role",
                slug="reviewer",
                version="2.0.0",
                status="failure",
                error="Not found",
            )
            _flush_handlers()

        content = (tmp_path / "logs" / "operations.log").read_text(encoding="utf-8")
        assert "status=failure" in content
        assert "error=Not found" in content
        assert "ERROR" in content

    def test_missing_version(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            log_operation(
                operation="uninstall",
                kind="skill",
                slug="foo",
                status="success",
            )
            _flush_handlers()

        content = (tmp_path / "logs" / "operations.log").read_text(encoding="utf-8")
        assert "slug=foo" in content
        # No version token when version is None.
        assert " v" not in content.split("slug=foo")[1].split("status=")[0]


    def test_newlines_in_error_are_escaped(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            log_operation(
                operation="install",
                kind="skill",
                slug="bad",
                status="failure",
                error="line1\nline2\nline3",
            )
            _flush_handlers()

        content = (tmp_path / "logs" / "operations.log").read_text(encoding="utf-8")
        # The entire log entry should be a single line (newlines escaped).
        log_lines = [l for l in content.strip().splitlines() if l.strip()]
        assert len(log_lines) == 1
        assert "line1\\nline2\\nline3" in content


class TestLogException:
    def test_includes_traceback(self, tmp_path):
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            try:
                raise ValueError("boom")
            except ValueError as exc:
                log_exception(
                    operation="publish",
                    kind="role",
                    slug="bad-role",
                    version="0.1.0",
                    exc=exc,
                )
            _flush_handlers()

        content = (tmp_path / "logs" / "operations.log").read_text(encoding="utf-8")
        assert "status=failure" in content
        assert "boom" in content
        assert "ValueError" in content
        assert "Traceback" in content

    def test_version_none(self, tmp_path):
        """log_exception works when version is None (e.g. install without --version)."""
        with patch("strawhub.logging.get_global_root", return_value=tmp_path):
            try:
                raise RuntimeError("oops")
            except RuntimeError as exc:
                log_exception(
                    operation="install",
                    kind="role",
                    slug="my-role",
                    exc=exc,
                )
            _flush_handlers()

        content = (tmp_path / "logs" / "operations.log").read_text(encoding="utf-8")
        assert "slug=my-role" in content
        assert "oops" in content
