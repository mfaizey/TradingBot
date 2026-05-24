from __future__ import annotations

from app.schemas import Opportunity


def filter_positive_profit(opportunities: list[Opportunity]) -> list[Opportunity]:
    """Keep only opportunities with net profit after fees and gas (expected_profit_usd > 0)."""
    return [item for item in opportunities if item.expected_profit_usd > 0]
