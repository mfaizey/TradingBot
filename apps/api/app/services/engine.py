from __future__ import annotations

import asyncio
from typing import Optional

from app.config import get_settings
from app.schemas import Opportunity
from app.services.execution import execution_service
from app.services.market import market_data_provider
from app.services.repository import trade_repository
from app.services.risk import risk_manager
from app.services.runtime import runtime_state


class AutonomousTradingEngine:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._task: Optional[asyncio.Task[None]] = None

    async def start(self) -> None:
        runtime_state.set_status("running")
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run_loop())

    async def pause(self) -> None:
        runtime_state.set_status("paused")

    async def stop(self) -> None:
        runtime_state.set_status("stopped")
        await self._cancel_task()

    async def emergency_stop(self) -> None:
        runtime_state.set_status("emergency_stop")
        await self._cancel_task()

    async def shutdown(self) -> None:
        await self._cancel_task()

    async def scan_once(self) -> list[Opportunity]:
        settings = runtime_state.get_settings()
        discovered = await market_data_provider.discover(settings)

        approved: list[Opportunity] = []
        for opportunity in discovered:
            decision = risk_manager.evaluate(opportunity, settings)
            if decision.allowed:
                approved.append(opportunity)

        runtime_state.touch_scan()
        runtime_state.update_opportunities(approved[:8])

        if runtime_state.bot_status == "running" and settings.auto_execute and approved:
            trade = await execution_service.execute(approved[0], settings)
            trade_repository.add(trade)
            runtime_state.record_trade(trade)
            runtime_state.mark_strategy_signal(approved[0].strategy, approved[0].venue_path)

        return approved

    async def _run_loop(self) -> None:
        while runtime_state.bot_status == "running":
            try:
                await self.scan_once()
            except Exception:
                runtime_state.set_status("paused")
                break

            await asyncio.sleep(self._settings.scan_interval_seconds)

    async def _cancel_task(self) -> None:
        if self._task is None:
            return

        if not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        self._task = None


bot_engine = AutonomousTradingEngine()
