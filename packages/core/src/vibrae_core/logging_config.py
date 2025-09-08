"""Central logging configuration helper."""
from __future__ import annotations
import logging
import logging.config
import os
from pathlib import Path
import re

DEFAULT_CONFIG_PATHS = [
    Path("config/logging.ini"),
]


def configure_logging(level: str | None = None, config_file: str | os.PathLike[str] | None = None) -> None:
    """Configure logging using an INI template.

    If the config contains the placeholder __LOG_LEVEL__, it is replaced with
    the effective log level before passing to logging.config.fileConfig.
    """
    lvl = (level or os.environ.get("LOG_LEVEL", "INFO")).upper()
    cfg_path: Path | None
    if config_file:
        cfg_path = Path(config_file)
    else:
        cfg_path = next((p for p in DEFAULT_CONFIG_PATHS if p.exists()), None)
    if not cfg_path or not cfg_path.exists():  # pragma: no cover - defensive
        logging.basicConfig(level=getattr(logging, lvl, logging.INFO), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
        return
    text = cfg_path.read_text(encoding="utf-8").replace("__LOG_LEVEL__", lvl)
    # Ensure logs directory exists for FileHandlers
    try:
        Path("logs").mkdir(exist_ok=True)
    except Exception:  # pragma: no cover - non-fatal
        pass
    # Optional debug snapshot only when VIBRAE_LOG_RENDER=1
    if os.environ.get("VIBRAE_LOG_RENDER", "0").lower() in ("1", "true", "yes"):  # pragma: no cover - opt-in
        logs_dir = Path("logs")
        logs_dir.mkdir(exist_ok=True)
        rendered = logs_dir / "rendered_logging.ini"
        try:
            rendered.write_text(text, encoding="utf-8")
        except Exception:  # pragma: no cover - non-fatal
            pass
    from io import StringIO
    logging.config.fileConfig(StringIO(text), disable_existing_loggers=False)

    # Install a redaction filter across all handlers to prevent token leakage.
    class _RedactionFilter(logging.Filter):
        TOKEN_PATTERNS = [
            re.compile(r"(Authorization\s*[:=]\s*Bearer\s+)([A-Za-z0-9._~+\-=/]+)", re.IGNORECASE),
            re.compile(r"([?&])token=([^&\s]+)", re.IGNORECASE),
            re.compile(r"(\"?token\"?\s*[:=]\s*\"?)([A-Za-z0-9._~+\-=/]+)(\"?)", re.IGNORECASE),
        ]

        @classmethod
        def redact(cls, s: str) -> str:
            try:
                out = s
                # Replace Authorization: Bearer ...
                out = cls.TOKEN_PATTERNS[0].sub(r"\1[REDACTED]", out)
                # Replace token=... in URLs / query strings
                out = cls.TOKEN_PATTERNS[1].sub(r"\1token=[REDACTED]", out)
                # Replace token fields in JSON-ish structures
                out = cls.TOKEN_PATTERNS[2].sub(r"\1[REDACTED]\3", out)
                return out
            except Exception:
                return s

        def filter(self, record: logging.LogRecord) -> bool:  # type: ignore[override]
            try:
                # If args are present, format first then replace msg/args to avoid double format.
                if record.args:
                    formatted = record.getMessage()
                    redacted = self.redact(formatted)
                    record.msg = redacted
                    record.args = None
                elif isinstance(record.msg, str):
                    record.msg = self.redact(record.msg)
            except Exception:
                pass
            return True

    redactor = _RedactionFilter()

    # Attach to all existing handlers from root and named loggers.
    seen_handlers = set()
    def _attach(logger: logging.Logger) -> None:
        for h in logger.handlers:
            if id(h) in seen_handlers:
                continue
            h.addFilter(redactor)
            seen_handlers.add(id(h))
        # Also attach at logger level to cover future handlers
        try:
            logger.addFilter(redactor)
        except Exception:
            pass

    _attach(logging.getLogger())  # root
    for name in list(logging.root.manager.loggerDict.keys()):  # type: ignore[attr-defined]
        logger_obj = logging.getLogger(name)
        _attach(logger_obj)

__all__ = ["configure_logging"]
