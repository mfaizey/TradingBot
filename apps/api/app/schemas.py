from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


BotStatus = Literal["running", "paused", "stopped", "emergency_stop"]
ExecutionPolicy = Literal["session-approved", "per-trade"]


class BotSettings(BaseModel):
    profit_threshold_usd: float = Field(default=35.0, ge=0)
    max_trade_size_usd: float = Field(default=2500.0, gt=0)
    daily_loss_limit_usd: float = Field(default=900.0, gt=0)
    stop_loss_percent: float = Field(default=2.5, ge=0, le=100)
    allowed_slippage_bps: int = Field(default=70, ge=0, le=1000)
    whitelisted_tokens: list[str] = Field(default_factory=list)
    blacklisted_tokens: list[str] = Field(default_factory=list)
    execution_policy: ExecutionPolicy = "session-approved"
    auto_execute: bool = True


class StrategyState(BaseModel):
    name: str
    mode: Literal["arbitrage", "swing", "momentum"]
    active: bool
    description: str
    allocation_percent: float
    last_signal: str


class Opportunity(BaseModel):
    id: str
    strategy: str
    pair: str
    chain: str
    venue_path: str
    size_usd: float
    expected_profit_usd: float
    expected_profit_native: float
    gas_cost_usd: float
    slippage_bps: int
    confidence: float
    risk_score: float
    estimated_latency_ms: int
    status: str


class TradeRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    executed_at: datetime
    pair: str
    strategy: str
    venue_path: str
    side: str
    size_usd: float
    pnl_usd: float
    pnl_native: float
    status: str
    chain: str
    tx_hash: Optional[str] = None
    notes: Optional[str] = None
    estimated_latency_ms: int = 0


class ChainBalance(BaseModel):
    chain: str
    native_symbol: str
    total_value_usd: float
    percentage_of_wallet: float


class AssetPosition(BaseModel):
    symbol: str
    chain: str
    amount: float
    price_usd: float
    value_usd: float
    allocation_percent: float


class WalletSnapshot(BaseModel):
    address: str
    network: str
    total_value_usd: float
    chain_balances: list[ChainBalance]
    assets: list[AssetPosition]


class DashboardMetrics(BaseModel):
    total_value_usd: float
    total_profit_usd: float
    total_profit_native: float
    wallet_growth_percent: float
    win_rate: float
    total_trades: int


class DashboardOverview(BaseModel):
    status: BotStatus
    last_scan_at: Optional[datetime] = None
    uptime_seconds: int = 0
    metrics: DashboardMetrics
    wallet: WalletSnapshot
    strategies: list[StrategyState]
    opportunities: list[Opportunity]
    trades: list[TradeRecord]


class ControlResponse(BaseModel):
    status: BotStatus
    message: str
    updated_at: datetime
