from __future__ import annotations

import math
import time
from typing import Protocol
from uuid import uuid4

from app.config import Settings, get_settings
from app.schemas import BotSettings, Opportunity


class MarketDataProvider(Protocol):
    async def discover(self, settings: BotSettings) -> list[Opportunity]: ...


class MockMarketDataProvider:
    def __init__(self) -> None:
        self._routes = [
            {
                "pair": "ETH/USDC",
                "chain": "Ethereum",
                "strategy": "Cross-venue arb",
                "venue_path": "Uniswap v3 -> Binance",
                "base_price": 3240.0,
                "max_notional": 2200.0,
                "fee_bps": 22,
                "gas_base": 13.5,
                "slippage_base": 26,
                "native_price": 3240.0,
            },
            {
                "pair": "BTC/USDC",
                "chain": "Arbitrum",
                "strategy": "Mean reversion swing",
                "venue_path": "SushiSwap -> Kraken",
                "base_price": 83450.0,
                "max_notional": 1800.0,
                "fee_bps": 18,
                "gas_base": 5.2,
                "slippage_base": 18,
                "native_price": 3240.0,
            },
            {
                "pair": "BNB/USDT",
                "chain": "BSC",
                "strategy": "Momentum burst",
                "venue_path": "PancakeSwap -> Bybit",
                "base_price": 582.0,
                "max_notional": 1600.0,
                "fee_bps": 16,
                "gas_base": 1.4,
                "slippage_base": 20,
                "native_price": 582.0,
            },
            {
                "pair": "MATIC/USDC",
                "chain": "Polygon",
                "strategy": "Cross-venue arb",
                "venue_path": "QuickSwap -> Coinbase Advanced",
                "base_price": 0.74,
                "max_notional": 1450.0,
                "fee_bps": 14,
                "gas_base": 0.35,
                "slippage_base": 24,
                "native_price": 0.74,
            },
        ]

    async def discover(self, settings: BotSettings) -> list[Opportunity]:
        now = time.time()
        candidates: list[Opportunity] = []

        for index, route in enumerate(self._routes):
            wave = math.sin((now / 10.0) + index)
            drift = math.cos((now / 13.0) + (index * 0.3))
            momentum = abs(math.sin((now / 17.0) + index))
            notional = min(settings.max_trade_size_usd, route["max_notional"] * (0.7 + (momentum * 0.4)))
            # Tune the mock spread curve so the dashboard surfaces realistic-looking
            # candidates without requiring live exchange credentials.
            spread_value = notional * (0.019 + (abs(wave) * 0.013))
            gas_cost = route["gas_base"] * (1.0 + (abs(drift) * 0.25))
            slippage = int(route["slippage_base"] + (momentum * 28))
            fee_cost = notional * (route["fee_bps"] / 10_000)
            expected_profit_usd = round(spread_value - gas_cost - fee_cost, 2)

            if expected_profit_usd <= 0:
                continue

            confidence = max(0.55, min(0.96, 0.64 + (momentum * 0.25) - (slippage / 1000)))
            risk_score = max(0.12, min(0.94, 0.18 + (slippage / 130) + (gas_cost / 180)))

            candidates.append(
                Opportunity(
                    id=f"opp_{uuid4().hex[:10]}",
                    strategy=route["strategy"],
                    pair=route["pair"],
                    chain=route["chain"],
                    venue_path=route["venue_path"],
                    size_usd=round(notional, 2),
                    expected_profit_usd=expected_profit_usd,
                    expected_profit_native=round(expected_profit_usd / route["native_price"], 6),
                    gas_cost_usd=round(gas_cost, 2),
                    slippage_bps=slippage,
                    confidence=round(confidence, 2),
                    risk_score=round(risk_score, 2),
                    estimated_latency_ms=int(220 + (momentum * 310)),
                    status="simulated",
                )
            )

        return sorted(candidates, key=lambda item: item.expected_profit_usd, reverse=True)


def build_market_data_provider(settings: Settings | None = None) -> MarketDataProvider:
    resolved = settings or get_settings()
    mode = resolved.market_mode.strip().lower()
    if mode in {"live", "web3", "real"}:
        from app.services.market_web3 import Web3MarketDataProvider

        return Web3MarketDataProvider(resolved)
    if mode == "ccxt":
        from app.services.market_ccxt import CcxtMarketDataProvider

        return CcxtMarketDataProvider(resolved)
    return MockMarketDataProvider()


def market_data_source_label(settings: Settings | None = None) -> str:
    resolved = settings or get_settings()
    mode = resolved.market_mode.strip().lower()
    if mode in {"live", "web3", "real"}:
        return "live"
    if mode == "ccxt":
        return "live"
    return "simulated"


market_data_provider = build_market_data_provider()
