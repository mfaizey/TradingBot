from __future__ import annotations

import asyncio
import logging
import time
from typing import Any
from uuid import uuid4

import httpx

from app.config import Settings
from app.schemas import BotSettings, Opportunity
logger = logging.getLogger(__name__)

DEXSCREENER_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens/{address}"
STABLE_QUOTES = frozenset({"USDC", "USDT", "DAI", "USDC.E", "USDT.E"})
SWAP_FEE_BPS_PER_LEG = 30

NATIVE_SYMBOL_BY_CHAIN: dict[str, str] = {
    "ethereum": "WETH",
    "arbitrum": "WETH",
    "bsc": "WBNB",
    "polygon": "WMATIC",
}

CHAIN_META: dict[str, dict[str, Any]] = {
    "ethereum": {
        "label": "Ethereum",
        "gas_units": 180_000,
        "default_gas_gwei": 25.0,
    },
    "arbitrum": {
        "label": "Arbitrum",
        "gas_units": 420_000,
        "default_gas_gwei": 0.12,
    },
    "bsc": {
        "label": "BSC",
        "gas_units": 160_000,
        "default_gas_gwei": 3.0,
    },
    "polygon": {
        "label": "Polygon",
        "gas_units": 200_000,
        "default_gas_gwei": 45.0,
    },
}

# Base tokens scanned per chain (canonical mainnet addresses).
TOKEN_WATCHLIST: tuple[dict[str, str], ...] = (
    {"chain": "ethereum", "symbol": "WETH", "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"},
    {"chain": "ethereum", "symbol": "WBTC", "address": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"},
    {"chain": "arbitrum", "symbol": "WETH", "address": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"},
    {"chain": "arbitrum", "symbol": "WBTC", "address": "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"},
    {"chain": "bsc", "symbol": "WBNB", "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"},
    {"chain": "polygon", "symbol": "WMATIC", "address": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"},
)


class Web3MarketDataProvider:
    """Cross-DEX spread scanner using on-chain DEX pair data (DexScreener aggregation)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._min_liquidity_usd = settings.web3_min_liquidity_usd
        self._min_spread_bps = settings.web3_min_spread_bps
        self._rpc_urls = {
            "ethereum": settings.ethereum_rpc_url,
            "arbitrum": settings.arbitrum_rpc_url,
            "bsc": settings.bsc_rpc_url,
            "polygon": settings.polygon_rpc_url,
        }

    async def discover(self, settings: BotSettings) -> list[Opportunity]:
        started = time.perf_counter()
        quotes = await self._fetch_dex_quotes()
        gas_prices = await self._fetch_gas_prices()
        native_prices = self._native_prices_usd(quotes)
        candidates = self._score_cross_dex_spreads(settings, quotes, gas_prices, native_prices)
        profitable = sum(1 for item in candidates if item.expected_profit_usd > 0)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "Web3 scan produced %s spreads (%s net-positive) from %s DEX quotes in %sms",
            len(candidates),
            profitable,
            len(quotes),
            elapsed_ms,
        )
        return candidates[:12]

    async def _fetch_dex_quotes(self) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=12.0) as client:
            tasks = [self._fetch_token_pairs(client, token) for token in TOKEN_WATCHLIST]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        quotes: list[dict[str, Any]] = []
        for result in results:
            if isinstance(result, Exception):
                logger.warning("DEX quote fetch failed: %s", result)
                continue
            quotes.extend(result)
        return quotes

    async def _fetch_token_pairs(
        self,
        client: httpx.AsyncClient,
        token: dict[str, str],
    ) -> list[dict[str, Any]]:
        url = DEXSCREENER_TOKEN_URL.format(address=token["address"])
        response = await client.get(url)
        response.raise_for_status()
        payload = response.json()
        pairs = payload.get("pairs") or []

        quotes: list[dict[str, Any]] = []
        for pair in pairs:
            chain_id = str(pair.get("chainId", "")).lower()
            if chain_id != token["chain"]:
                continue

            base = pair.get("baseToken") or {}
            quote = pair.get("quoteToken") or {}
            if base.get("symbol") != token["symbol"]:
                continue
            if quote.get("symbol") not in STABLE_QUOTES:
                continue

            price_usd = pair.get("priceUsd")
            liquidity = pair.get("liquidity") or {}
            liquidity_usd = liquidity.get("usd")
            if price_usd is None or float(price_usd) <= 0:
                continue
            if liquidity_usd is None or float(liquidity_usd) < self._min_liquidity_usd:
                continue

            dex_id = str(pair.get("dexId", "unknown"))
            quotes.append(
                {
                    "chain": chain_id,
                    "chain_label": CHAIN_META[chain_id]["label"],
                    "pair": f"{base.get('symbol')}/{quote.get('symbol')}",
                    "base_symbol": base.get("symbol"),
                    "quote_symbol": quote.get("symbol"),
                    "dex": dex_id,
                    "price_usd": float(price_usd),
                    "liquidity_usd": float(liquidity_usd),
                }
            )
        return quotes

    async def _fetch_gas_prices(self) -> dict[str, float]:
        tasks = {
            chain: self._fetch_chain_gas_gwei(chain, rpc_url)
            for chain, rpc_url in self._rpc_urls.items()
            if rpc_url
        }
        if not tasks:
            return {}

        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        gas_prices: dict[str, float] = {}
        for chain, result in zip(tasks.keys(), results):
            if isinstance(result, Exception):
                logger.debug("Gas price fetch failed for %s: %s", chain, result)
                continue
            if result and result > 0:
                gas_prices[chain] = float(result)
        return gas_prices

    async def _fetch_chain_gas_gwei(self, chain: str, rpc_url: str) -> float:
        payload = {"jsonrpc": "2.0", "id": 1, "method": "eth_gasPrice", "params": []}
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.post(rpc_url, json=payload)
            response.raise_for_status()
            result = response.json().get("result")
            if not result:
                raise ValueError(f"No gas price in RPC response for {chain}")
            return int(result, 16) / 1_000_000_000

    def _native_prices_usd(self, quotes: list[dict[str, Any]]) -> dict[str, float]:
        native_prices: dict[str, float] = {}
        for quote in quotes:
            chain = quote["chain"]
            native_symbol = NATIVE_SYMBOL_BY_CHAIN.get(chain)
            if native_symbol and quote.get("base_symbol") == native_symbol:
                native_prices[chain] = max(native_prices.get(chain, 0.0), quote["price_usd"])
        return native_prices

    def _estimate_gas_cost_usd(
        self,
        chain: str,
        native_prices: dict[str, float],
        gas_prices: dict[str, float],
    ) -> float:
        meta = CHAIN_META[chain]
        gas_gwei = gas_prices.get(chain, meta["default_gas_gwei"])
        gas_native = (meta["gas_units"] * gas_gwei) / 1_000_000_000
        fallback_native_usd = {"ethereum": 2_200.0, "arbitrum": 2_200.0, "bsc": 650.0, "polygon": 0.75}
        native_price_usd = native_prices.get(chain, fallback_native_usd.get(chain, 1.0))
        return round(gas_native * native_price_usd, 2)

    def _score_cross_dex_spreads(
        self,
        settings: BotSettings,
        quotes: list[dict[str, Any]],
        gas_prices: dict[str, float],
        native_prices: dict[str, float],
    ) -> list[Opportunity]:
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for quote in quotes:
            key = (quote["chain"], quote["pair"])
            grouped.setdefault(key, []).append(quote)

        opportunities: list[Opportunity] = []
        for (chain, pair), pair_quotes in grouped.items():
            if len(pair_quotes) < 2:
                continue

            best_buy = min(pair_quotes, key=lambda item: item["price_usd"])
            best_sell = max(pair_quotes, key=lambda item: item["price_usd"])
            if best_buy["dex"] == best_sell["dex"]:
                continue

            buy_price = best_buy["price_usd"]
            sell_price = best_sell["price_usd"]
            if sell_price <= buy_price:
                continue

            spread_ratio = (sell_price - buy_price) / buy_price
            spread_bps = int(spread_ratio * 10_000)
            if spread_bps < self._min_spread_bps:
                continue

            liquidity_cap = min(best_buy["liquidity_usd"], best_sell["liquidity_usd"]) * 0.01
            notional = min(settings.max_trade_size_usd, 2_500.0, liquidity_cap)
            if notional < 100:
                continue

            gross_profit = notional * spread_ratio
            swap_fees = notional * ((SWAP_FEE_BPS_PER_LEG * 2) / 10_000)
            gas_cost = self._estimate_gas_cost_usd(chain, native_prices, gas_prices)
            expected_profit_usd = round(gross_profit - swap_fees - gas_cost, 2)

            slippage_bps = max(12, min(120, spread_bps + 10))
            momentum = min(1.0, spread_ratio * 100)
            confidence = round(max(0.55, min(0.96, 0.6 + (momentum * 0.3) - (slippage_bps / 1500))), 2)
            risk_score = round(max(0.12, min(0.85, 0.22 + (slippage_bps / 140) + (gas_cost / 200))), 2)

            opportunities.append(
                Opportunity(
                    id=f"opp_{uuid4().hex[:10]}",
                    strategy="Cross-DEX arb",
                    pair=pair,
                    chain=best_buy["chain_label"],
                    venue_path=f"{best_buy['dex']} -> {best_sell['dex']}",
                    size_usd=round(notional, 2),
                    expected_profit_usd=expected_profit_usd,
                    expected_profit_native=round(expected_profit_usd / sell_price, 6),
                    gas_cost_usd=gas_cost,
                    slippage_bps=slippage_bps,
                    confidence=confidence,
                    risk_score=risk_score,
                    estimated_latency_ms=int(320 + (slippage_bps * 6)),
                    status="live" if expected_profit_usd > 0 else "marginal",
                )
            )

        return sorted(
            opportunities,
            key=lambda item: (item.expected_profit_usd, item.slippage_bps),
            reverse=True,
        )
