from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.config import get_settings
from app.services.engine import bot_engine
from app.services.runtime import runtime_state

logger = logging.getLogger(__name__)

MONITOR_SCAN_SECONDS = 5


async def ensure_fresh_opportunities() -> None:
    """Refresh cached opportunities when the dashboard polls faster than the bot loop."""
    settings = get_settings()
    last_scan = runtime_state.last_scan_at
    now = datetime.now(timezone.utc)

    if last_scan is not None:
        age_seconds = (now - last_scan).total_seconds()
        if age_seconds < MONITOR_SCAN_SECONDS:
            return

    try:
        await bot_engine.scan_once()
    except Exception:
        logger.exception("Opportunity refresh failed")


async def run_opportunity_monitor() -> None:
    """Background scanner for the opportunity stream while the bot is idle."""
    while True:
        if runtime_state.bot_status != "running":
            try:
                await bot_engine.scan_once()
            except Exception:
                logger.exception("Background market monitor scan failed")
        await asyncio.sleep(MONITOR_SCAN_SECONDS)
