"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CandlestickChart,
  CircleStop,
  Cpu,
  Play,
  Shield,
  Wallet
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";

import { WalletPanel } from "@/components/wallet/wallet-panel";
import { useWallet } from "@/components/wallet/wallet-provider";
import { api } from "@/lib/api";
import { formatCompact, formatPercent, formatUsd, shortenAddress } from "@/lib/format";
import type { BotSettings, BotStatus, DashboardOverview, ExecutionPolicy } from "@/types/domain";

type SettingsDraft = {
  profit_threshold_usd: string;
  max_trade_size_usd: string;
  daily_loss_limit_usd: string;
  stop_loss_percent: string;
  allowed_slippage_bps: string;
  whitelisted_tokens: string;
  blacklisted_tokens: string;
  execution_policy: ExecutionPolicy;
  auto_execute: boolean;
};

function toDraft(settings: BotSettings): SettingsDraft {
  return {
    profit_threshold_usd: String(settings.profit_threshold_usd),
    max_trade_size_usd: String(settings.max_trade_size_usd),
    daily_loss_limit_usd: String(settings.daily_loss_limit_usd),
    stop_loss_percent: String(settings.stop_loss_percent),
    allowed_slippage_bps: String(settings.allowed_slippage_bps),
    whitelisted_tokens: settings.whitelisted_tokens.join(", "),
    blacklisted_tokens: settings.blacklisted_tokens.join(", "),
    execution_policy: settings.execution_policy,
    auto_execute: settings.auto_execute
  };
}

function fromDraft(draft: SettingsDraft): BotSettings {
  return {
    profit_threshold_usd: Number(draft.profit_threshold_usd),
    max_trade_size_usd: Number(draft.max_trade_size_usd),
    daily_loss_limit_usd: Number(draft.daily_loss_limit_usd),
    stop_loss_percent: Number(draft.stop_loss_percent),
    allowed_slippage_bps: Number(draft.allowed_slippage_bps),
    whitelisted_tokens: draft.whitelisted_tokens
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean),
    blacklisted_tokens: draft.blacklisted_tokens
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean),
    execution_policy: draft.execution_policy,
    auto_execute: draft.auto_execute
  };
}

function statusTone(status: BotStatus) {
  switch (status) {
    case "running":
      return "bg-emerald-400/15 text-emerald-200 ring-emerald-400/40";
    case "paused":
      return "bg-amber-400/15 text-amber-100 ring-amber-400/40";
    case "emergency_stop":
      return "bg-rose-500/15 text-rose-100 ring-rose-500/40";
    default:
      return "bg-slate-400/15 text-slate-200 ring-white/15";
  }
}

function Panel({
  title,
  kicker,
  children,
  className = ""
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel rounded-[28px] p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          {kicker ? <p className="text-xs uppercase tracking-[0.28em] text-mist/70">{kicker}</p> : null}
          <h2 className="font-display text-xl text-ink">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="panel rounded-[24px] p-5">
      <p className="text-sm uppercase tracking-[0.2em] text-mist/70">{label}</p>
      <p className="mt-3 font-display text-3xl text-ink">{value}</p>
      <p className="mt-2 text-sm text-mist">{detail}</p>
    </div>
  );
}

export function TradingPortal() {
  const { address, truncatedAddress, chainName, nativeBalance, nativeBalanceUsd, lifecycle } = useWallet();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();
  const deferredOverview = useDeferredValue(overview);
  const activeOverview = deferredOverview ?? overview;

  const refreshPortal = useCallback(async () => {
    try {
      const [nextOverview, nextSettings] = await Promise.all([
        api.getOverview(address ?? undefined),
        api.getSettings()
      ]);

      startTransition(() => {
        setOverview(nextOverview);
        setDraft((currentDraft) => currentDraft ?? toDraft(nextSettings));
        setError(null);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reach the trading API.");
    }
  }, [address, startTransition]);

  useEffect(() => {
    void refreshPortal();
    const interval = window.setInterval(() => {
      void refreshPortal();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [refreshPortal]);

  const lastScan = useMemo(() => {
    if (!activeOverview?.last_scan_at) {
      return "Awaiting first market sweep";
    }

    return new Date(activeOverview.last_scan_at).toLocaleString();
  }, [activeOverview?.last_scan_at]);

  const portfolioValue = nativeBalanceUsd ?? formatUsd(activeOverview?.metrics.total_value_usd ?? 0);
  const portfolioDetail = nativeBalanceUsd
    ? "Live value from connected wallet native balance."
    : "Cross-chain wallet value with mark-to-market pricing.";

  async function runAction(action: "start" | "pause" | "stop" | "emergency-stop") {
    setBusyAction(action);
    setError(null);

    try {
      if (action === "start") {
        await api.startBot();
      }
      if (action === "pause") {
        await api.pauseBot();
      }
      if (action === "stop") {
        await api.stopBot();
      }
      if (action === "emergency-stop") {
        await api.emergencyStop();
      }

      await refreshPortal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Bot action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveSettings() {
    if (!draft) {
      return;
    }

    setBusyAction("save");
    setError(null);

    try {
      await api.updateSettings(fromDraft(draft));
      setDraft(toDraft(fromDraft(draft)));
      await refreshPortal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Saving settings failed.");
    } finally {
      setBusyAction(null);
    }
  }

  if (!activeOverview || !draft) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center">
        <div className="panel rounded-[30px] px-8 py-10 text-center">
          <p className="font-display text-2xl">Bootstrapping the trading desk...</p>
          <p className="mt-3 text-sm text-mist">Connecting the dashboard, wallet layer, and autonomous engine.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <section className="panel overflow-hidden rounded-[36px] p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.28em] text-mist/85">
              <Cpu className="h-4 w-4 text-accent" />
              Autonomous Multi-Chain Crypto Desk
            </div>
            <h1 className="mt-6 max-w-3xl font-display text-4xl leading-tight text-ink sm:text-5xl">
              Wallet-connected trading operations with live safety rails and execution visibility.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-mist sm:text-lg">
              This portal wires wallet authentication, real-time opportunity scanning, strategy controls, and emergency shutdown into one operator surface. Live execution is structured around signing-only flows and policy-vault approvals instead of private-key custody.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm ring-1 ${statusTone(activeOverview.status)}`}>
                <Activity className="mr-2 h-4 w-4" />
                Bot status: {activeOverview.status.replace("_", " ")}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/6 px-4 py-2 text-sm text-mist ring-1 ring-white/10">
                Last scan: {lastScan}
              </span>
              <span className="inline-flex items-center rounded-full bg-white/6 px-4 py-2 text-sm text-mist ring-1 ring-white/10">
                Uptime: {formatCompact(activeOverview.uptime_seconds)}s
              </span>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-accent" />
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-mist/80">Wallet integration</p>
                <p className="font-display text-xl">MetaMask, WalletConnect, Trust Wallet, Coinbase</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 text-sm text-mist">
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-mist/70">Connected address</p>
                <p className="mt-2 font-medium text-ink">
                  {truncatedAddress ?? shortenAddress(address ?? activeOverview.wallet.address)}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-mist/70">Current network</p>
                  <p className="mt-2 text-ink">{chainName ?? activeOverview.wallet.network}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-mist/70">Native balance</p>
                  <p className="mt-2 text-ink">{nativeBalance ?? "Connect a wallet"}</p>
                </div>
              </div>
              <p className="text-xs text-mist/80">Lifecycle state: {lifecycle}</p>
            </div>
          </div>
        </div>
      </section>

      <WalletPanel />

      {error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Portfolio value"
          value={portfolioValue}
          detail={portfolioDetail}
        />
        <MetricCard
          label="Net P/L"
          value={formatUsd(activeOverview.metrics.total_profit_usd)}
          detail={`${activeOverview.metrics.total_profit_native.toFixed(4)} native-equivalent realized.`}
        />
        <MetricCard
          label="Wallet growth"
          value={formatPercent(activeOverview.metrics.wallet_growth_percent)}
          detail="Change versus seeded baseline equity."
        />
        <MetricCard
          label="Win rate"
          value={`${activeOverview.metrics.win_rate.toFixed(1)}%`}
          detail={`${activeOverview.metrics.total_trades} recorded trades and intents.`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Panel title="Portfolio growth dashboard" kicker="Portfolio">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              {activeOverview.wallet.chain_balances.map((chainBalance) => (
                <div key={chainBalance.chain} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-ink">{chainBalance.chain}</p>
                      <p className="text-sm text-mist">{chainBalance.native_symbol} settlement rail</p>
                    </div>
                    <p className="font-display text-2xl text-ink">{formatUsd(chainBalance.total_value_usd)}</p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/8">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-accent to-amber"
                      style={{ width: `${Math.min(chainBalance.percentage_of_wallet, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.22em] text-mist/70">
                    {chainBalance.percentage_of_wallet.toFixed(2)}% of wallet
                  </p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/6 text-mist">
                  <tr>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Chain</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOverview.wallet.assets.map((asset) => (
                    <tr key={`${asset.symbol}-${asset.chain}`} className="border-t border-white/8">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-ink">{asset.symbol}</p>
                          <p className="text-xs text-mist">{asset.allocation_percent.toFixed(2)}% allocation</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-mist">{asset.chain}</td>
                      <td className="px-4 py-3 text-ink">{formatCompact(asset.amount)}</td>
                      <td className="px-4 py-3 text-ink">{formatUsd(asset.value_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <Panel title="User controls and safety" kicker="Controls">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="profit-threshold">
                Minimum net profit threshold (USD)
              </label>
              <input
                id="profit-threshold"
                onChange={(event) => setDraft({ ...draft, profit_threshold_usd: event.target.value })}
                type="number"
                value={draft.profit_threshold_usd}
              />
            </div>
            <div>
              <label className="label" htmlFor="max-trade-size">
                Maximum trade size (USD)
              </label>
              <input
                id="max-trade-size"
                onChange={(event) => setDraft({ ...draft, max_trade_size_usd: event.target.value })}
                type="number"
                value={draft.max_trade_size_usd}
              />
            </div>
            <div>
              <label className="label" htmlFor="daily-loss-limit">
                Daily loss limit (USD)
              </label>
              <input
                id="daily-loss-limit"
                onChange={(event) => setDraft({ ...draft, daily_loss_limit_usd: event.target.value })}
                type="number"
                value={draft.daily_loss_limit_usd}
              />
            </div>
            <div>
              <label className="label" htmlFor="stop-loss">
                Stop-loss per trade (%)
              </label>
              <input
                id="stop-loss"
                onChange={(event) => setDraft({ ...draft, stop_loss_percent: event.target.value })}
                type="number"
                value={draft.stop_loss_percent}
              />
            </div>
            <div>
              <label className="label" htmlFor="slippage">
                Allowed slippage (bps)
              </label>
              <input
                id="slippage"
                onChange={(event) => setDraft({ ...draft, allowed_slippage_bps: event.target.value })}
                type="number"
                value={draft.allowed_slippage_bps}
              />
            </div>
            <div>
              <label className="label" htmlFor="execution-policy">
                Execution policy
              </label>
              <select
                id="execution-policy"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    execution_policy: event.target.value as ExecutionPolicy
                  })
                }
                value={draft.execution_policy}
              >
                <option value="session-approved">Session-approved vault</option>
                <option value="per-trade">Per-trade signatures</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="whitelist">
                Whitelisted tokens
              </label>
              <input
                id="whitelist"
                onChange={(event) => setDraft({ ...draft, whitelisted_tokens: event.target.value })}
                placeholder="ETH, USDC, BTC, ARB"
                value={draft.whitelisted_tokens}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="blacklist">
                Blacklisted tokens
              </label>
              <input
                id="blacklist"
                onChange={(event) => setDraft({ ...draft, blacklisted_tokens: event.target.value })}
                placeholder="PEPE, SHIB"
                value={draft.blacklisted_tokens}
              />
            </div>
            <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-mist">
              <input
                checked={draft.auto_execute}
                onChange={(event) => setDraft({ ...draft, auto_execute: event.target.checked })}
                type="checkbox"
              />
              Enable autonomous execution when an opportunity clears all checks.
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-accent px-4 py-3 font-medium text-slate-950 transition hover:bg-[#91f4d6]"
              disabled={busyAction === "save"}
              onClick={() => void saveSettings()}
              type="button"
            >
              <Shield className="mr-2 inline h-4 w-4" />
              Save safety profile
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 font-medium text-ink transition hover:bg-white/10"
              disabled={busyAction === "start"}
              onClick={() => void runAction("start")}
              type="button"
            >
              <Play className="mr-2 inline h-4 w-4" />
              Start
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 font-medium text-ink transition hover:bg-white/10"
              disabled={busyAction === "pause"}
              onClick={() => void runAction("pause")}
              type="button"
            >
              <Activity className="mr-2 inline h-4 w-4" />
              Pause
            </button>
            <button
              className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 font-medium text-ink transition hover:bg-white/10"
              disabled={busyAction === "stop"}
              onClick={() => void runAction("stop")}
              type="button"
            >
              <CircleStop className="mr-2 inline h-4 w-4" />
              Stop
            </button>
            <button
              className="rounded-2xl bg-danger px-4 py-3 font-medium text-white transition hover:opacity-90"
              disabled={busyAction === "emergency-stop"}
              onClick={() => void runAction("emergency-stop")}
              type="button"
            >
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              Emergency stop
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/8 px-4 py-4 text-sm text-amber-50">
            All live execution should route through a policy vault or per-trade wallet signature flow. This UI intentionally avoids private-key custody.
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel title="Active strategies" kicker="Bot logic">
          <div className="space-y-4">
            {activeOverview.strategies.map((strategy) => (
              <div key={strategy.name} className="rounded-3xl border border-white/10 bg-black/10 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl text-ink">{strategy.name}</h3>
                    <p className="mt-1 text-sm text-mist">{strategy.description}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.22em] ring-1 ${strategy.active ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/40" : "bg-white/8 text-mist ring-white/15"}`}>
                    {strategy.mode}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-mist">
                  <span>Capital allocation</span>
                  <span>{strategy.allocation_percent.toFixed(1)}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/8">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-accent via-white/70 to-amber"
                    style={{ width: `${Math.min(strategy.allocation_percent, 100)}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-mist">Latest signal: {strategy.last_signal}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Opportunity detection stream" kicker="Scanner">
          <div className="overflow-hidden rounded-3xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/6 text-mist">
                <tr>
                  <th className="px-4 py-3 font-medium">Pair</th>
                  <th className="px-4 py-3 font-medium">Route</th>
                  <th className="px-4 py-3 font-medium">Profit</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {activeOverview.opportunities.map((opportunity) => (
                  <tr key={opportunity.id} className="border-t border-white/8">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{opportunity.pair}</p>
                      <p className="text-xs text-mist">{opportunity.chain}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{opportunity.venue_path}</p>
                      <p className="text-xs text-mist">{opportunity.strategy}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{formatUsd(opportunity.expected_profit_usd)}</p>
                      <p className="text-xs text-mist">
                        gas {formatUsd(opportunity.gas_cost_usd)} | slip {opportunity.slippage_bps} bps
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">confidence {(opportunity.confidence * 100).toFixed(0)}%</p>
                      <p className="text-xs text-mist">
                        risk {(opportunity.risk_score * 100).toFixed(0)}% | {opportunity.estimated_latency_ms} ms
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Trade history" kicker="Performance">
          <div className="overflow-hidden rounded-3xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/6 text-mist">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Trade</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">P/L</th>
                </tr>
              </thead>
              <tbody>
                {activeOverview.trades.map((trade) => (
                  <tr key={trade.id} className="border-t border-white/8">
                    <td className="px-4 py-3 text-mist">{new Date(trade.executed_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{trade.pair}</p>
                      <p className="text-xs text-mist">
                        {trade.strategy} via {trade.venue_path}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.22em] ring-1 ${trade.status === "filled" ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/40" : trade.status === "authorization_required" ? "bg-amber-400/15 text-amber-100 ring-amber-400/40" : "bg-rose-500/15 text-rose-100 ring-rose-500/40"}`}>
                        {trade.status.replace("_", " ")}
                      </span>
                      <p className="mt-2 text-xs text-mist">{trade.chain}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={trade.pnl_usd >= 0 ? "font-medium text-emerald-200" : "font-medium text-rose-200"}>
                        {formatUsd(trade.pnl_usd)}
                      </p>
                      <p className="text-xs text-mist">{trade.tx_hash ? `${trade.tx_hash.slice(0, 12)}...` : trade.notes}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Security and permissions" kicker="Guardrails">
          <div className="space-y-4 text-sm text-mist">
            <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-accent" />
                <p className="font-medium text-ink">Signing-only permissions</p>
              </div>
              <p className="mt-3">
                The bot never asks for private keys. Users either pre-authorize a policy vault with strict limits or sign each trade intent individually.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
              <div className="flex items-center gap-3">
                <CandlestickChart className="h-5 w-5 text-amber" />
                <p className="font-medium text-ink">Risk-adjusted execution</p>
              </div>
              <p className="mt-3">
                Opportunities must clear net-profit, slippage, whitelist, blacklist, max-size, and daily drawdown checks before they can execute.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-accent" />
                <p className="font-medium text-ink">DEX + CEX abstraction</p>
              </div>
              <p className="mt-3">
                The backend is split into market data, risk, execution, and storage layers so CCXT, Uniswap, PancakeSwap, SushiSwap, and other venue adapters can be added cleanly.
              </p>
            </div>
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.22em] text-mist/70">
            {isRefreshing ? "Refreshing live data..." : "Portal synced with the latest backend snapshot"}
          </p>
        </Panel>
      </section>
    </div>
  );
}
