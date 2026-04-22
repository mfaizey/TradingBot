from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers.control import router as control_router
from app.routers.dashboard import router as dashboard_router
from app.services.engine import bot_engine
from app.services.runtime import runtime_state

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    await bot_engine.scan_once()
    yield
    await bot_engine.shutdown()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router, prefix="/api", tags=["dashboard"])
app.include_router(control_router, prefix="/api", tags=["control"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "bot_status": runtime_state.bot_status,
        "environment": settings.environment,
    }
