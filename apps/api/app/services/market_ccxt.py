from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from uuid import uuid4

import ccxt.async_support as ccxt_async

from app.config import Settings
from app.schemas import BotSettings, Opportunity
from app.services.market_filters import filter_positive_profit

logger = logging.getLogger(__name__)

WATCHLIST = ("BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT")
COMPARE_EXCHANGES = ("binance", "kraken", "bybit")
TAKER_FEE_BPS = 10


class CcxtMarketDataProvider:
    """Cross-exchange spread scanner using public CCXT market data."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._exchange_ids = self._resolve_exchange_ids()

    def _resolve_exchange_ids(self) -> tuple[str, ...]:
        primary = self._settings.ccxt_exchange.strip().lower()
        if primary and primary in COMPARE_EXCHANGES:
            ordered = (primary, *(exchange for exchange in COMPARE_EXCHANGES if exchange != primary))
            return ordered
        return COMPARE_EXCHANGES

    def _build_exchange(self, exchange_id: str) -> ccxt_async.Exchange:
        exchange_class = getattr(ccxt_async, exchange_id, None)
        if exchange_class is None:
            raise ValueError(f"Unsupported CCXT exchange: {exchange_id}")

        config: dict[str, Any] = {"enableRateLimit": True}
        if exchange_id == "binance":
            config["options"] = {"defaultType": "spot"}
        if self._settings.ccxt_api_key:
            config["apiKey"] = self._settings.ccxt_api_key
        if self._settings.ccxt_api_secret:
            config["apiSecret"] = self._settings.ccxt_api_secret
        return exchange_class(config)

    async def discover(self, settings: BotSettings) -> list[Opportunity]:
        started = time.perf_counter()
        quotes = await self._fetch_quotes()
        candidates = filter_positive_profit(self._score_cross_exchange_spreads(settings, quotes))
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "CCXT scan produced %s profitable opportunities from %s quotes in %sms",
            len(candidates),
            len(quotes),
            elapsed_ms,
        )
        return candidates

    async def _fetch_quotes(self) -> list[dict[str, Any]]:
        tasks = [self._fetch_exchange_quotes(exchange_id) for exchange_id in self._exchange_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        quotes: list[dict[str, Any]] = []
        for result in results:
            if isinstance(result, Exception):
                logger.warning("CCXT quote fetch failed: %s", result)
                continue
            quotes.extend(result)
        return quotes

    async def _fetch_exchange_quotes(self, exchange_id: str) -> list[dict[str, Any]]:
        exchange = self._build_exchange(exchange_id)
        quotes: list[dict[str, Any]] = []
        try:
            await exchange.load_markets()
            markets = exchange.markets or {}
            for pair in WATCHLIST:
                if pair not in markets:
                    continue

                ticker = await exchange.fetch_ticker(pair)
                bid = ticker.get("bid")
                ask = ticker.get("ask")
                last = ticker.get("last")
                if bid is None or ask is None or bid <= 0 or ask <= 0:
                    continue

                mid = (bid + ask) / 2
                reference_price = last if last and last > 0 else mid
                spread_bps = int(((ask - bid) / mid) * 10_000) if mid > 0 else 0
                quotes.append(
                    {
                        "exchange": exchange_id,
                        "pair": pair,
                        "bid": float(bid),
                        "ask": float(ask),
                        "reference_price": float(reference_price),
                        "spread_bps": spread_bps,
                    }
                )
        finally:
            await exchange.close()
        return quotes

    def _score_cross_exchange_spreads(
        self,
        settings: BotSettings,
        quotes: list[dict[str, Any]],
    ) -> list[Opportunity]:
        by_pair: dict[str, list[dict[str, Any]]] = {}
        for quote in quotes:
            by_pair.setdefault(quote["pair"], []).append(quote)

        opportunities: list[Opportunity] = []
        for pair, pair_quotes in by_pair.items():
            if len(pair_quotes) < 2:
                continue

            best_buy = min(pair_quotes, key=lambda item: item["ask"])
            best_sell = max(pair_quotes, key=lambda item: item["bid"])
            if best_buy["exchange"] == best_sell["exchange"]:
                continue

            buy_price = best_buy["ask"]
            sell_price = best_sell["bid"]
            if sell_price <= buy_price:
                continue

            spread_ratio = (sell_price - buy_price) / buy_price
            spread_bps = int(spread_ratio * 10_000)
            if spread_bps < 1:
                continue

            notional = min(settings.max_trade_size_usd, 2_500.0)
            gross_profit = notional * spread_ratio
            fee_cost = notional * ((TAKER_FEE_BPS * 2) / 10_000)
            expected_profit_usd = round(gross_profit - fee_cost, 2)
            if expected_profit_usd <= 0:
                continue

            slippage_bps = max(best_buy["spread_bps"], best_sell["spread_bps"]) + 8
            reference_price = best_sell["reference_price"]
            momentum = min(1.0, spread_ratio * 120)
            confidence = round(max(0.55, min(0.96, 0.62 + (momentum * 0.28) - (slippage_bps / 1200))), 2)
            risk_score = round(max(0.12, min(0.8, 0.2 + (slippage_bps / 160))), 2)

            opportunities.append(
                Opportunity(
                    id=f"opp_{uuid4().hex[:10]}",
                    strategy="Cross-venue arb",
                    pair=pair,
                    chain="CEX",
                    venue_path=f"{best_buy['exchange']} -> {best_sell['exchange']}",
                    size_usd=round(notional, 2),
                    expected_profit_usd=expected_profit_usd,
                    expected_profit_native=round(expected_profit_usd / reference_price, 6),
                    gas_cost_usd=0.0,
                    slippage_bps=slippage_bps,
                    confidence=confidence,
                    risk_score=risk_score,
                    estimated_latency_ms=int(180 + (slippage_bps * 4)),
                    status="live",
                )
            )

        return sorted(opportunities, key=lambda item: item.expected_profit_usd, reverse=True)
