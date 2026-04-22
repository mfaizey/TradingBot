# Autonomous Trading Portal

This workspace contains a greenfield crypto trading portal with:

- A Next.js + Tailwind frontend for wallet connection, portfolio visibility, opportunity monitoring, and risk controls.
- A FastAPI backend with an autonomous bot loop, opportunity scoring, trade persistence, and bot control endpoints.
- A Solidity policy-vault contract that demonstrates a signing-only execution model instead of custodial key handling.

## Project structure

```text
apps/
  api/   FastAPI backend, market/risk/execution services, trade persistence
  web/   Next.js dashboard with wallet integration and live monitoring
contracts/
  ExecutionPolicyVault.sol
docs/
  architecture.md
```

## Local setup

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 2. Configure the backend

```bash
cd apps/api
cp .env.example .env
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload
```

The backend defaults to SQLite if `DATABASE_URL` is not changed, but the included `.env.example` is already pointed at PostgreSQL.

### 3. Configure the frontend

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` before using WalletConnect in a real environment.

## What ships today

- Wallet UI for MetaMask, Coinbase Wallet, WalletConnect, and browser-injected providers.
- Cross-chain portfolio cards and asset allocation tables.
- Bot control surface for start, pause, stop, emergency stop, and safety settings.
- Simulated opportunity scanning across Uniswap/PancakeSwap/SushiSwap-style routes and centralized venues.
- Persistent trade logging plus win-rate and P/L metrics.

## Production hardening still required

- Replace the mock data provider with live CCXT and on-chain quoting adapters.
- Add database migrations and secret management.
- Deploy and audit the policy-vault contract on every supported chain.
- Add authentication, rate limiting, observability, and end-to-end execution tests.
