from __future__ import annotations

from dataclasses import dataclass

from app.schemas import BotSettings, Opportunity
from app.services.repository import trade_repository


@dataclass
class RiskDecision:
    allowed: bool
    reason: str


class RiskManager:
    def evaluate(self, opportunity: Opportunity, settings: BotSettings) -> RiskDecision:
        base_symbol, quote_symbol = [token.upper() for token in opportunity.pair.split("/")]
        whitelist = {token.upper() for token in settings.whitelisted_tokens}
        blacklist = {token.upper() for token in settings.blacklisted_tokens}

        if whitelist and (base_symbol not in whitelist or quote_symbol not in whitelist):
            return RiskDecision(False, "Pair is outside the whitelist.")

        if base_symbol in blacklist or quote_symbol in blacklist:
            return RiskDecision(False, "Pair includes a blacklisted token.")

        if opportunity.size_usd > settings.max_trade_size_usd:
            return RiskDecision(False, "Notional exceeds the max trade size.")

        if opportunity.expected_profit_usd < settings.profit_threshold_usd:
            return RiskDecision(False, "Opportunity is below the profit threshold.")

        if opportunity.slippage_bps > settings.allowed_slippage_bps:
            return RiskDecision(False, "Projected slippage breaches the safety limit.")

        if trade_repository.daily_drawdown_usd() >= settings.daily_loss_limit_usd:
            return RiskDecision(False, "Daily loss limit has been reached.")

        if opportunity.risk_score > 0.82:
            return RiskDecision(False, "Risk score is too high for autonomous execution.")

        return RiskDecision(True, "Opportunity is inside the configured risk envelope.")


risk_manager = RiskManager()
