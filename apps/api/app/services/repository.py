from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select

from app.database import SessionLocal
from app.models import TradeLog
from app.schemas import DashboardMetrics, TradeRecord


class TradeRepository:
    def __init__(self) -> None:
        self._session_factory = SessionLocal

    def add(self, trade: TradeRecord) -> TradeRecord:
        with self._session_factory() as session:
            record = TradeLog(
                id=trade.id,
                executed_at=trade.executed_at,
                pair=trade.pair,
                strategy=trade.strategy,
                venue_path=trade.venue_path,
                side=trade.side,
                size_usd=trade.size_usd,
                pnl_usd=trade.pnl_usd,
                pnl_native=trade.pnl_native,
                status=trade.status,
                chain=trade.chain,
                tx_hash=trade.tx_hash,
                notes=trade.notes,
                estimated_latency_ms=trade.estimated_latency_ms,
            )
            session.add(record)
            session.commit()
        return trade

    def list_recent(self, limit: int = 18) -> list[TradeRecord]:
        with self._session_factory() as session:
            rows = session.execute(
                select(TradeLog).order_by(desc(TradeLog.executed_at)).limit(limit)
            ).scalars()
            return [TradeRecord.model_validate(row) for row in rows]

    def daily_drawdown_usd(self) -> float:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        with self._session_factory() as session:
            rows = session.execute(
                select(TradeLog).where(TradeLog.executed_at >= since)
            ).scalars()
            return round(
                sum(abs(row.pnl_usd) for row in rows if row.pnl_usd < 0 and row.status != "authorization_required"),
                2,
            )

    def build_metrics(self, current_value_usd: float, initial_value_usd: float) -> DashboardMetrics:
        trades = self.list_recent(limit=250)
        closed_trades = [trade for trade in trades if trade.status in {"filled", "stopped_out"}]
        winning_trades = [trade for trade in closed_trades if trade.pnl_usd > 0]
        total_profit_usd = round(sum(trade.pnl_usd for trade in trades if trade.status != "authorization_required"), 2)
        total_profit_native = round(
            sum(trade.pnl_native for trade in trades if trade.status != "authorization_required"),
            6,
        )
        win_rate = round((len(winning_trades) / len(closed_trades)) * 100, 2) if closed_trades else 0.0
        growth = round(((current_value_usd - initial_value_usd) / initial_value_usd) * 100, 2) if initial_value_usd else 0.0

        return DashboardMetrics(
            total_value_usd=round(current_value_usd, 2),
            total_profit_usd=total_profit_usd,
            total_profit_native=total_profit_native,
            wallet_growth_percent=growth,
            win_rate=win_rate,
            total_trades=len(trades),
        )


trade_repository = TradeRepository()
