from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Iterable, Optional

from app.config import get_settings
from app.schemas import AssetPosition, BotSettings, ChainBalance, Opportunity, StrategyState, TradeRecord, WalletSnapshot

@dataclass
class PositionState:
    symbol: str
    chain: str
    amount: float
    price_usd: float

    @property
    def value_usd(self) -> float:
        return round(self.amount * self.price_usd, 2)


class RuntimeState:
    def __init__(self) -> None:
        settings = get_settings()
        self._lock = Lock()
        self.bot_status = "stopped"
        self.last_scan_at: Optional[datetime] = None
        self.started_at: Optional[datetime] = None
        self.settings = BotSettings(
            profit_threshold_usd=settings.default_profit_threshold_usd,
            max_trade_size_usd=settings.default_max_trade_size_usd,
            daily_loss_limit_usd=settings.default_daily_loss_limit_usd,
            stop_loss_percent=settings.default_stop_loss_percent,
            allowed_slippage_bps=settings.default_allowed_slippage_bps,
            execution_policy="session-approved",
            auto_execute=settings.auto_execute_default,
        )
        self.default_wallet_address = settings.default_wallet_address
        self.opportunities: list[Opportunity] = []
        self.positions: list[PositionState] = [
            PositionState("USDC", "Ethereum", 12450.0, 1.0),
            PositionState("ETH", "Ethereum", 1.82, 3240.0),
            PositionState("WBTC", "Arbitrum", 0.11, 83450.0),
            PositionState("ARB", "Arbitrum", 2180.0, 0.91),
            PositionState("USDT", "BSC", 4280.0, 1.0),
            PositionState("BNB", "BSC", 7.6, 582.0),
            PositionState("MATIC", "Polygon", 3820.0, 0.74),
            PositionState("USDC", "Polygon", 2860.0, 1.0),
        ]
        self.initial_equity_usd = round(sum(position.value_usd for position in self.positions), 2)
        self.strategies: list[StrategyState] = [
            StrategyState(
                name="Cross-venue arb",
                mode="arbitrage",
                active=True,
                description="Compares DEX pools against CEX order books for net-positive spread capture.",
                allocation_percent=45.0,
                last_signal="Standing by",
            ),
            StrategyState(
                name="Mean reversion swing",
                mode="swing",
                active=True,
                description="Rotates into oversold majors when volatility compresses and momentum stabilizes.",
                allocation_percent=30.0,
                last_signal="Watching ETH and BTC pullbacks",
            ),
            StrategyState(
                name="Momentum burst",
                mode="momentum",
                active=True,
                description="Enters breakouts after liquidity and gas conditions stay inside guardrails.",
                allocation_percent=25.0,
                last_signal="Awaiting confirmation",
            ),
        ]

    def get_settings(self) -> BotSettings:
        with self._lock:
            return self.settings.model_copy(deep=True)

    def update_settings(self, payload: BotSettings) -> BotSettings:
        payload.whitelisted_tokens = [token.upper() for token in payload.whitelisted_tokens]
        payload.blacklisted_tokens = [token.upper() for token in payload.blacklisted_tokens]
        with self._lock:
            self.settings = payload
            return self.settings.model_copy(deep=True)

    def set_status(self, status: str) -> None:
        with self._lock:
            self.bot_status = status
            if status == "running":
                if self.started_at is None:
                    self.started_at = datetime.now(timezone.utc)
            elif status in {"stopped", "emergency_stop"}:
                self.started_at = None

    def touch_scan(self) -> None:
        with self._lock:
            self.last_scan_at = datetime.now(timezone.utc)

    def update_opportunities(self, opportunities: Iterable[Opportunity]) -> None:
        with self._lock:
            self.opportunities = list(opportunities)

    def mark_strategy_signal(self, strategy_name: str, signal: str) -> None:
        with self._lock:
            for strategy in self.strategies:
                if strategy.name == strategy_name:
                    strategy.last_signal = signal
                    break

    def record_trade(self, trade: TradeRecord) -> None:
        quote_symbol = trade.pair.split("/")[1]
        delta_value_usd = trade.pnl_usd

        with self._lock:
            for position in self.positions:
                if position.symbol == quote_symbol and position.chain == trade.chain:
                    if position.price_usd > 0:
                        position.amount = round(position.amount + (delta_value_usd / position.price_usd), 6)
                    break
            else:
                self.positions.append(
                    PositionState(
                        symbol=quote_symbol,
                        chain=trade.chain,
                        amount=round(delta_value_usd, 6),
                        price_usd=1.0,
                    )
                )

            for strategy in self.strategies:
                if strategy.name == trade.strategy:
                    strategy.last_signal = f"Last fill on {trade.pair} ({trade.status})"
                    break

    def uptime_seconds(self) -> int:
        with self._lock:
            if self.started_at is None:
                return 0
            return int((datetime.now(timezone.utc) - self.started_at).total_seconds())

    def build_wallet_snapshot(self, address: Optional[str] = None) -> WalletSnapshot:
        with self._lock:
            positions = [position for position in self.positions]

        total_value_usd = round(sum(position.value_usd for position in positions), 2)
        chain_totals: dict[str, float] = {}
        chain_symbols = {
            "Ethereum": "ETH",
            "BSC": "BNB",
            "Polygon": "MATIC",
            "Arbitrum": "ETH",
        }

        for position in positions:
            chain_totals[position.chain] = round(chain_totals.get(position.chain, 0.0) + position.value_usd, 2)

        assets = [
            AssetPosition(
                symbol=position.symbol,
                chain=position.chain,
                amount=round(position.amount, 6),
                price_usd=position.price_usd,
                value_usd=position.value_usd,
                allocation_percent=round((position.value_usd / total_value_usd) * 100, 2) if total_value_usd else 0.0,
            )
            for position in sorted(positions, key=lambda item: item.value_usd, reverse=True)
        ]

        chain_balances = [
            ChainBalance(
                chain=chain,
                native_symbol=chain_symbols.get(chain, "ETH"),
                total_value_usd=value,
                percentage_of_wallet=round((value / total_value_usd) * 100, 2) if total_value_usd else 0.0,
            )
            for chain, value in sorted(chain_totals.items(), key=lambda item: item[1], reverse=True)
        ]

        return WalletSnapshot(
            address=address or self.default_wallet_address,
            network="Multi-chain execution ready",
            total_value_usd=total_value_usd,
            chain_balances=chain_balances,
            assets=assets,
        )

    def get_strategies(self) -> list[StrategyState]:
        with self._lock:
            return [strategy.model_copy(deep=True) for strategy in self.strategies]

    def get_opportunities(self) -> list[Opportunity]:
        with self._lock:
            return [opportunity.model_copy(deep=True) for opportunity in self.opportunities]


runtime_state = RuntimeState()
