from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from uuid import uuid4

from app.schemas import BotSettings, Opportunity, TradeRecord


class SimulatedExecutionService:
    async def execute(self, opportunity: Opportunity, settings: BotSettings) -> TradeRecord:
        if settings.execution_policy == "per-trade":
            return TradeRecord(
                id=f"trade_{uuid4().hex[:12]}",
                executed_at=datetime.now(timezone.utc),
                pair=opportunity.pair,
                strategy=opportunity.strategy,
                venue_path=opportunity.venue_path,
                side="awaiting_signature",
                size_usd=opportunity.size_usd,
                pnl_usd=0.0,
                pnl_native=0.0,
                status="authorization_required",
                chain=opportunity.chain,
                tx_hash=None,
                notes="Trade intent prepared. Waiting for wallet signature on the policy vault.",
                estimated_latency_ms=opportunity.estimated_latency_ms,
            )

        fill_curve = 0.76 + abs(math.sin(time.time() / 9.0)) * 0.31
        slippage_drag = opportunity.size_usd * (opportunity.slippage_bps / 10000) * 0.35
        realized_pnl_usd = round((opportunity.expected_profit_usd * fill_curve) - slippage_drag, 2)
        stop_loss_cap = round(opportunity.size_usd * (settings.stop_loss_percent / 100), 2)
        realized_pnl_usd = max(realized_pnl_usd, -stop_loss_cap)
        status = "filled" if realized_pnl_usd >= 0 else "stopped_out"

        return TradeRecord(
            id=f"trade_{uuid4().hex[:12]}",
            executed_at=datetime.now(timezone.utc),
            pair=opportunity.pair,
            strategy=opportunity.strategy,
            venue_path=opportunity.venue_path,
            side="buy" if opportunity.strategy != "Cross-venue arb" else "arb",
            size_usd=opportunity.size_usd,
            pnl_usd=realized_pnl_usd,
            pnl_native=round(realized_pnl_usd / max(opportunity.size_usd, 1), 6),
            status=status,
            chain=opportunity.chain,
            tx_hash=f"0x{uuid4().hex}{uuid4().hex[:24]}",
            notes="Executed in simulation mode. Replace with live smart-contract settlement for production.",
            estimated_latency_ms=opportunity.estimated_latency_ms,
        )


execution_service = SimulatedExecutionService()
