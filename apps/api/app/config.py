from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Autonomous Trading Portal API"
    environment: str = "development"
    database_url: str = "sqlite:///./tradingbot.db"
    cors_origins: str = "http://localhost:3000"
    market_mode: str = "mock"
    execution_mode: str = "simulation"
    scan_interval_seconds: int = 12

    default_wallet_address: str = "0x9C1A8D7F0B4c0A6b6a8E7d701C4A3147D0b8e3f5"
    default_profit_threshold_usd: float = 35.0
    default_max_trade_size_usd: float = 2500.0
    default_daily_loss_limit_usd: float = 900.0
    default_stop_loss_percent: float = 2.5
    default_allowed_slippage_bps: int = 70
    auto_execute_default: bool = True

    walletconnect_project_id: str = ""
    alchemy_api_key: str = ""
    infura_api_key: str = ""
    ccxt_exchange: str = "binance"
    ccxt_api_key: str = ""
    ccxt_api_secret: str = ""

    ethereum_rpc_url: str = "https://eth.llamarpc.com"
    arbitrum_rpc_url: str = "https://arb1.arbitrum.io/rpc"
    bsc_rpc_url: str = "https://bsc-dataseed.binance.org"
    polygon_rpc_url: str = "https://polygon-rpc.com"
    web3_min_liquidity_usd: float = 50_000.0
    web3_min_spread_bps: int = 3

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
