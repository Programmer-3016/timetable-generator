"""Logging helpers for classifier service."""

from __future__ import annotations

import logging


_LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"


_configured = False


def configure_logging(level: int = logging.INFO) -> None:
    global _configured
    if _configured:
        return

    logging.basicConfig(level=level, format=_LOG_FORMAT)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)
