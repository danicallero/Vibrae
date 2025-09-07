"""Central logging configuration helper.

Replaces scattered logging setup logic. Provides a reusable configure_logging
function that can be called by scripts and the API startup.
"""
from __future__ import annotations
import logging
import logging.config
import os
from pathlib import Path

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

__all__ = ["configure_logging"]
