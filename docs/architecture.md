# Architecture

## Objectives

- Wallet-native user experience using `wagmi` connectors and EIP-1193-compatible providers.
- Autonomous scanning across DEX/CEX venue abstractions with explicit risk gating before any execution.
- Signing-only live execution model through a policy vault or per-trade wallet signature flow.
- PostgreSQL-compatible trade logging and a clean separation between runtime state, market data, execution, and presentation layers.

## Topology

### Frontend

- `apps/web` is a Next.js App Router dashboard.
- Wallet connectivity is handled with `wagmi` for MetaMask, Coinbase Wallet, WalletConnect v2, and browser-injected wallets.
- The portal polls the FastAPI backend every five seconds for live state, opportunities, portfolio changes, and trade history.

### Backend

- `apps/api/app/main.py` wires FastAPI, CORS, startup database initialization, and API routing.
- `services/market.py` is the market-data abstraction. It ships with a mock provider that simulates DEX/CEX spreads, gas, slippage, and latency. This is the seam to replace with CCXT + on-chain quote adapters.
- `services/risk.py` enforces profit threshold, max trade size, daily loss, slippage, whitelist, blacklist, and risk score checks.
- `services/execution.py` currently runs in simulation mode and exposes the place to integrate live policy-vault execution.
- `services/runtime.py` owns in-memory strategy state, wallet allocations, and bot lifecycle state.
- `services/repository.py` persists trade logs and computes dashboard metrics from the database.

## Live Trading Path

To move from simulation into production:

1. Replace the mock market provider with adapters that query CCXT order books plus on-chain routers and pool reserves.
2. Expand the execution service to encode router calldata and submit it through a signing-only contract flow.
3. Deploy `contracts/ExecutionPolicyVault.sol` on each target chain and grant the backend executor only bounded permissions.
4. Switch `DATABASE_URL` to PostgreSQL and add migrations before production use.

## Safety Model

- No private keys are stored by the portal.
- Users can choose `session-approved` execution for vault-based autonomy or `per-trade` signatures for stricter manual authorization.
- Emergency stop, whitelists, blacklists, max notional, and stop-loss ceilings are exposed in the UI and enforced in the backend.
