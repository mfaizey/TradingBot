from typing import Optional

from fastapi import APIRouter, Query

from app.schemas import DashboardOverview, Opportunity, TradeRecord, WalletSnapshot
from app.services.engine import bot_engine
from app.services.repository import trade_repository
from app.services.runtime import runtime_state

router = APIRouter()


@router.get("/overview", response_model=DashboardOverview)
async def get_overview(address: Optional[str] = Query(default=None)) -> DashboardOverview:
    if not runtime_state.get_opportunities():
        await bot_engine.scan_once()

    wallet = runtime_state.build_wallet_snapshot(address)
    metrics = trade_repository.build_metrics(wallet.total_value_usd, runtime_state.initial_equity_usd)

    return DashboardOverview(
        status=runtime_state.bot_status,
        last_scan_at=runtime_state.last_scan_at,
        uptime_seconds=runtime_state.uptime_seconds(),
        metrics=metrics,
        wallet=wallet,
        strategies=runtime_state.get_strategies(),
        opportunities=runtime_state.get_opportunities(),
        trades=trade_repository.list_recent(),
    )


@router.get("/portfolio", response_model=WalletSnapshot)
async def get_portfolio(address: Optional[str] = Query(default=None)) -> WalletSnapshot:
    return runtime_state.build_wallet_snapshot(address)


@router.get("/opportunities", response_model=list[Opportunity])
async def get_opportunities() -> list[Opportunity]:
    if not runtime_state.get_opportunities():
        await bot_engine.scan_once()
    return runtime_state.get_opportunities()


@router.get("/trades", response_model=list[TradeRecord])
async def get_trades() -> list[TradeRecord]:
    return trade_repository.list_recent()
