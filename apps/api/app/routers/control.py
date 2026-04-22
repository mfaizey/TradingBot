from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas import BotSettings, ControlResponse
from app.services.engine import bot_engine
from app.services.runtime import runtime_state

router = APIRouter()


@router.get("/settings", response_model=BotSettings)
async def get_settings() -> BotSettings:
    return runtime_state.get_settings()


@router.put("/settings", response_model=BotSettings)
async def update_settings(payload: BotSettings) -> BotSettings:
    return runtime_state.update_settings(payload)


@router.post("/bot/start", response_model=ControlResponse)
async def start_bot() -> ControlResponse:
    await bot_engine.start()
    return ControlResponse(
        status=runtime_state.bot_status,
        message="Autonomous trading engine started.",
        updated_at=datetime.now(timezone.utc),
    )


@router.post("/bot/pause", response_model=ControlResponse)
async def pause_bot() -> ControlResponse:
    await bot_engine.pause()
    return ControlResponse(
        status=runtime_state.bot_status,
        message="Bot paused. Market scanning remains available for monitoring.",
        updated_at=datetime.now(timezone.utc),
    )


@router.post("/bot/stop", response_model=ControlResponse)
async def stop_bot() -> ControlResponse:
    await bot_engine.stop()
    return ControlResponse(
        status=runtime_state.bot_status,
        message="Bot stopped and background execution loop terminated.",
        updated_at=datetime.now(timezone.utc),
    )


@router.post("/bot/emergency-stop", response_model=ControlResponse)
async def emergency_stop() -> ControlResponse:
    await bot_engine.emergency_stop()
    return ControlResponse(
        status=runtime_state.bot_status,
        message="Emergency stop engaged. All automated execution has been halted.",
        updated_at=datetime.now(timezone.utc),
    )
