"""Persistent operation logging for the StrawHub CLI.

Writes structured log entries to $STRAWPOT_HOME/logs/operations.log
using Python's logging module with rotating file handlers.
"""

import logging
import traceback
from logging.handlers import RotatingFileHandler

from strawhub.paths import get_global_root

_LOG_DIR_NAME = "logs"
_LOG_FILE_NAME = "operations.log"
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_BACKUP_COUNT = 3
_LOG_FORMAT = "%(asctime)s | %(levelname)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"

_logger: logging.Logger | None = None


def get_logger() -> logging.Logger:
    """Return the shared operations logger, creating it on first call.

    The logger writes to ``$STRAWPOT_HOME/logs/operations.log`` with
    rotation at 5 MB and 3 backup files.  If the log directory cannot
    be created or written to, a :class:`logging.NullHandler` is used
    instead so that callers never need to handle logging errors.
    """
    global _logger
    if _logger is not None:
        return _logger

    _logger = logging.getLogger("strawhub.operations")
    _logger.setLevel(logging.DEBUG)
    # Prevent propagation to the root logger (avoid duplicate output).
    _logger.propagate = False

    try:
        log_dir = get_global_root() / _LOG_DIR_NAME
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / _LOG_FILE_NAME

        handler = RotatingFileHandler(
            log_file,
            maxBytes=_MAX_BYTES,
            backupCount=_BACKUP_COUNT,
            encoding="utf-8",
        )
        handler.setLevel(logging.DEBUG)
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
        _logger.addHandler(handler)
    except Exception:
        # Filesystem or config issue — fall back to a no-op handler.
        _logger.addHandler(logging.NullHandler())

    return _logger


def reset_logger() -> None:
    """Reset the cached logger.  Used by tests."""
    global _logger
    if _logger is not None:
        for handler in list(_logger.handlers):
            handler.close()
            _logger.removeHandler(handler)
    _logger = None


def log_operation(
    *,
    operation: str,
    kind: str,
    slug: str,
    version: str | None = None,
    status: str,
    error: str | None = None,
) -> None:
    """Log a CLI operation to the persistent log file.

    Parameters
    ----------
    operation:
        The operation name (``install``, ``uninstall``, ``update``,
        ``publish``).
    kind:
        Resource kind (``skill``, ``role``, ``agent``, ``memory``,
        ``integration``).
    slug:
        Resource slug.
    version:
        Resource version, if known.
    status:
        Outcome — ``success`` or ``failure``.
    error:
        Error description on failure.
    """
    try:
        logger = get_logger()
        ver_part = f" v{version}" if version else ""
        msg = f"op={operation} kind={kind} slug={slug}{ver_part} status={status}"
        if error:
            escaped_error = error.replace("\n", "\\n")
            msg += f" error={escaped_error}"

        if status == "failure":
            logger.error(msg)
        else:
            logger.info(msg)
    except Exception:
        pass  # Logging must never interrupt CLI operations


def log_exception(
    *,
    operation: str,
    kind: str,
    slug: str,
    version: str | None = None,
    exc: BaseException,
) -> None:
    """Log an operation failure with a full traceback.

    Convenience wrapper around :func:`log_operation` that formats the
    exception and appends the traceback.
    """
    try:
        tb = "".join(traceback.format_exception(exc))
        error_detail = f"{exc}\n{tb}"
        log_operation(
            operation=operation,
            kind=kind,
            slug=slug,
            version=version,
            status="failure",
            error=error_detail,
        )
    except Exception:
        pass  # Logging must never interrupt CLI operations
