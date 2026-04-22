from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TradeLog(Base):
    __tablename__ = "trade_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    pair: Mapped[str] = mapped_column(String(40), nullable=False)
    strategy: Mapped[str] = mapped_column(String(30), nullable=False)
    venue_path: Mapped[str] = mapped_column(String(120), nullable=False)
    side: Mapped[str] = mapped_column(String(12), nullable=False)
    size_usd: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_usd: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_native: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    chain: Mapped[str] = mapped_column(String(30), nullable=False)
    tx_hash: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estimated_latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
