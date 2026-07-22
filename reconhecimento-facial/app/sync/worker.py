"""Worker em background: reprocessa batidas pending/error → Frequência SIGA."""

from __future__ import annotations

import atexit
import logging
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from flask import Flask

logger = logging.getLogger(__name__)

_worker_started = False
_stop_event: threading.Event | None = None


def start_attendance_sync_worker(app: Flask, interval_seconds: int = 45) -> None:
    """Inicia um daemon que periodicamente sincroniza a fila local."""
    global _worker_started, _stop_event
    if _worker_started:
        return
    # Evita dois workers no reloader (pai + filho).
    import os

    if app.debug:
        # Filho do reloader: WERKZEUG_RUN_MAIN=true. Pai: ausente ou false.
        run_main = os.environ.get("WERKZEUG_RUN_MAIN")
        if run_main is not None and run_main != "true":
            return

    _stop_event = threading.Event()
    interval = max(15, int(interval_seconds))

    def _loop() -> None:
        assert _stop_event is not None
        while not _stop_event.wait(interval):
            try:
                with app.app_context():
                    from app.sync.supabase_attendance import run_sync_batch

                    result = run_sync_batch(limit=50)
                    if result.synced or result.errors:
                        logger.info(
                            "sync worker: synced=%s errors=%s skipped=%s",
                            result.synced,
                            result.errors,
                            result.skipped,
                        )
            except Exception:  # noqa: BLE001
                logger.exception("sync worker falhou")

    thread = threading.Thread(
        target=_loop,
        name="siga-attendance-sync",
        daemon=True,
    )
    thread.start()
    _worker_started = True

    def _stop() -> None:
        if _stop_event is not None:
            _stop_event.set()

    atexit.register(_stop)
