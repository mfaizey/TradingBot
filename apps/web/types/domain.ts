export type BotStatus = "running" | "paused" | "stopped" | "emergency_stop";
export type ExecutionPolicy = "session-approved" | "per-trade";

export interface BotSettings {
  profit_threshold_usd: number;
  max_trade_size_usd: number;
  daily_loss_limit_usd: number;
  stop_loss_percent: number;
  allowed_slippage_bps: number;
  whitelisted_tokens: string[];
  blacklisted_tokens: string[];
  execution_policy: ExecutionPolicy;
  auto_execute: boolean;
}

export interface ControlResponse {
  status: BotStatus;
  message: string;
  updated_at: string;
}

export interface StrategyState {
  name: string;
  mode: "arbitrage" | "swing" | "momentum";
  active: boolean;
  description: string;
  allocation_percent: number;
  last_signal: string;
}

export interface Opportunity {
  id: string;
  strategy: string;
  pair: string;
  chain: string;
  venue_path: string;
  size_usd: number;
  expected_profit_usd: number;
  expected_profit_native: number;
  gas_cost_usd: number;
  slippage_bps: number;
  confidence: number;
  risk_score: number;
  estimated_latency_ms: number;
  status: string;
}

export interface TradeRecord {
  id: string;
  executed_at: string;
  pair: string;
  strategy: string;
  venue_path: string;
  side: string;
  size_usd: number;
  pnl_usd: number;
  pnl_native: number;
  status: string;
  chain: string;
  tx_hash?: string | null;
  notes?: string | null;
  estimated_latency_ms: number;
}

export interface ChainBalance {
  chain: string;
  native_symbol: string;
  total_value_usd: number;
  percentage_of_wallet: number;
}

export interface AssetPosition {
  symbol: string;
  chain: string;
  amount: number;
  price_usd: number;
  value_usd: number;
  allocation_percent: number;
}

export interface WalletSnapshot {
  address: string;
  network: string;
  total_value_usd: number;
  chain_balances: ChainBalance[];
  assets: AssetPosition[];
}

export interface DashboardMetrics {
  total_value_usd: number;
  total_profit_usd: number;
  total_profit_native: number;
  wallet_growth_percent: number;
  win_rate: number;
  total_trades: number;
}

export interface DashboardOverview {
  status: BotStatus;
  last_scan_at: string | null;
  uptime_seconds: number;
  market_data_source: "live" | "simulated" | string;
  metrics: DashboardMetrics;
  wallet: WalletSnapshot;
  strategies: StrategyState[];
  opportunities: Opportunity[];
  trades: TradeRecord[];
}
