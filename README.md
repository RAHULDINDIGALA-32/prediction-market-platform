<div align="center">

# <img src="./dapp/public/logo.png" alt="0x01 Markets Logo" width="70" align="center" /> 0x01 Markets
</div>

**Live dApp:** https://0x01-markets.vercel.app

On-chain binary prediction market platform built on Ethereum with LMSR pricing, signed off-chain quote generation, optimistic oracle resolution, and a full-stack Next.js dApp backed by Foundry smart contracts.

![0x01 Markets home page](./dapp/public/home-page.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.27-363636)](https://docs.soliditylang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.1-000000)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-149ECA)](https://react.dev/)
[![Network](https://img.shields.io/badge/Network-Sepolia-orange)](https://sepolia.etherscan.io/)

## Overview

0x01 Markets is a monorepo for a prediction market protocol and application layer. The system lets approved creators launch binary markets, traders buy or sell YES/NO exposure using LMSR-based pricing, and resolvers finalize outcomes through a bonded optimistic oracle workflow. Settlement is non-custodial and isolated per market through a dedicated vault flow.

This repository is best described as a production-oriented testnet build: the architecture is serious, the contract surface is separated cleanly, and the project includes solid protocol tests and a working application stack, while still leaving room for audit hardening and operational maturity before a mainnet launch.

## What This Project Demonstrates

- Protocol design for binary prediction markets using an LMSR market-making model.
- Separation of concerns across market creation, trading, treasury, oracle budgeting, resolution, and settlement.
- Signed quote execution using EIP-712-style verification through `QuoteVerifier`.
- Full-stack TypeScript integration with Next.js App Router, Prisma, PostgreSQL, RainbowKit, Wagmi, and Viem.
- Blockchain-to-database synchronization for market, oracle, settlement, and authorization data.
- A meaningful Foundry test suite covering lifecycle, fund flow, oracle, settlement, and invariant-heavy protocol behavior.

### Core Features

### 🎯 Trading Engine

| Feature | Description |
|---------|-------------|
| **AMM-Based Pricing** | Logarithmic Market Scoring Rule (LMSR) ensures continuous prices with bounded loss. |
| **Binary Markets** | YES/NO prediction markets with atomic settlement of outcome tokens. |
| **Off-Chain Quotes** | Quotes generated off-chain and executed on-chain with signature verification (gas-efficient). |
| **Slippage Protection** | Minimum output and minimum return guarantees passed at execution time. |
| **EIP-712 style signatures** | Quotes are signed and verified by QuoteVerifier to prevent tampering. |


### 🔮 Oracle & Settlement

| Feature | Description |
|--------|-------------|
| **Optimistic oracle** | Proposers post bonds and suggest outcomes; community may dispute within a configurable window. |
| **Bonded proposers & disputers** | Economic incentives for honest reporting; malicious actors risk losing bonds. |
| **Lazy finalization** | Oracle outcome is finalized on-demand when the first settlement call is made, saving gas. |
| **One-step redemption** | Winning token holders redeem ETH in a single `redeem` call. |
| **Creator withdrawal** | Market creators can withdraw remaining collateral after the redemption window closes. |


### 🔐 Security & Governance

| Feature | Description |
|--------|-------------|
| **Creator whitelisting** | Only approved addresses can create markets, mitigating spam or malicious markets. |
| **Role-based access** | Distinct roles for creators, proposers, disputers, resolvers, and admins. |
| **Platform treasury** | A `0.03 ETH` market creation fee per market, split as `0.02 ETH` to `OracleBudget` and `0.01 ETH` to `PlatformTreasury`. |
| **Non-custodial vault** | Vault holds per-market ETH; users interact via AMM & settlement rather than centralized custody. |
| **Fund isolation** | Trading collateral is isolated from oracle budget and treasury flows. |


### 💻 Developer Experience

| Feature | Description |
|--------|-------------|
| **TypeScript everywhere** | Frontend React components, API routes, and Prisma client are fully typed. |
| **Foundry test suite** | Extensive tests covering market lifecycle, oracle behavior, redemption windows, and fund flows. |
| **Prisma ORM** | Type-safe database access for markets, trades, oracle events, sync logs, and roles. |
| **Next.js API routes** | REST-style endpoints for markets, trades, portfolio, oracle, settlement, and cron-style sync. |
| **Event indexing** | Background scripts and API endpoints synchronize blockchain events into PostgreSQL. |

### Smart Contract System

| Contract | Responsibility | Sepolia Deployment |
|---|---|---|
| `MarketFactory` | Creates markets, enforces creator whitelist, tracks metadata hash uniqueness, routes creation fees and subsidy. | [0x46B...88c](https://sepolia.etherscan.io/address/0x46B9Ac33F1FD06A9Ab2a57aaB08b50746E20d88c) |
| `Market` | Executes trades, mints and burns outcome tokens, manages market state, and records quote consumption. | [0x46B...88c](https://sepolia.etherscan.io/address/0x46B9Ac33F1FD06A9Ab2a57aaB08b50746E20d88c) |
| `OutcomeToken` | ERC-20 YES and NO tokens minted by markets and burned during settlement or sell flow. | [0x46B...88c](https://sepolia.etherscan.io/address/0x46B9Ac33F1FD06A9Ab2a57aaB08b50746E20d88c) |
| `Vault` | Holds and isolates market collateral. | [0xFe8...E76](https://sepolia.etherscan.io/address/0xFe8Ce9222B437cE7ddbb3f733165FFb3A8E28E76) |
| `QuoteVerifier` | Verifies signed trade quotes and manages signer + nonce logic. | [0x4a0...602](https://sepolia.etherscan.io/address/0x4a03B6159Dfc32f2ae52E3388377DE3F2fe76602) |
| `OracleBudget` | Funds oracle-side market bounties. | [0x191...Df6](https://sepolia.etherscan.io/address/0x191785021Ba67222DDd72405cC06E262fa9A7Df6) |
| `OracleAdapter` | Handles proposer/disputer flow and final market outcomes. | [0x447...192](https://sepolia.etherscan.io/address/0x447f8D2cc12fD096b86865f529dd5e0bC831A192) |
| `SettlementEngine` | Redeems winning exposure and closes settlement lifecycle. | [0x23d...8f6](https://sepolia.etherscan.io/address/0x23daAe106b33F5181d08970115c43A9e5036a8f6) |
| `PlatformTreasury` | Accrues protocol-side fees. | [0x9F0...82c](https://sepolia.etherscan.io/address/0x9F005b9be16c7Cb8B63d79487eCF6f136669F82c) |



### Application Layer

The dApp includes:

- Market browsing and detail views.
- Quote fetching and trade execution flows.
- Portfolio and settlement views.
- Oracle and settlement operator panels.
- Admin workflows for market registration, signer management, authorization sync, and reconciliation.
- Prisma-backed persistence for market state and protocol events.

---

## Tech Stack

### Smart Contracts

- Solidity
- Foundry
- OpenZeppelin Contracts

### Frontend and Backend

- Next.js 16
- React 19
- TypeScript
- RainbowKit
- Wagmi
- Viem
- Ethers
- Prisma
- PostgreSQL
- Tailwind CSS 4

---

## Repository Structure
This is a monorepo with a clear split between the dApp and the contracts:

```text
.
├── dapp/                 # Next.js 16 app + REST API + Prisma/PostgreSQL
│   ├── src/app/          # Next.js app router pages & API routes
│   ├── src/components/   # UI and domain components
│   ├── src/lib/          # LMSR engine, quote logic, auth, services
│   ├── prisma/           # Prisma schema and migrations
│   ├── scripts/          # Node scripts (market registration, event sync)
│   └── package.json      # Frontend & backend scripts
│
├── foundry/              # Solidity contracts & tests (Foundry)
│   ├── src/              # Core protocol contracts
│   │   ├── MarketFactory.sol
│   │   ├── Market.sol
│   │   ├── OutcomeToken.sol
│   │   ├── Vault.sol
│   │   ├── OracleAdapter.sol
│   │   ├── OracleBudget.sol
│   │   ├── QuoteVerifier.sol
│   │   ├── SettlementEngine.sol
│   │   └── PlatformTreasury.sol
│   ├── test/             # Unit + integration + invariant tests
│   └── foundry.toml      # Compiler & project configuration
│
├── README.md             # This file
└── LICENSE
```

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE (Next.js)                │
│  Markets | Portfolio | Oracle | Settlement | Trust Management  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┴──────────────────┐
        │                                     │
┌───────▼────────┐                  ┌────────▼────────┐
│  REST API      │                  │  Quote Service  │
│   - Markets    │                  │  (Quote Signer) │
│   - Trades     │                  │  (EIP-712)      │
│   - Settlement │                  └────────┬────────┘
└───────┬────────┘                           │
        │                                     │
┌───────▼────────────────────────────────────▼────────┐
│            PostgreSQL Database (Prisma ORM)         │
│  - Markets | Trades | Users | Oracle Proposals      │
└─────────────────────────┬───────────────────────────┘
                          │
        ┌─────────────────▼──────────────────┐
        │                                     │
┌───────▼──────────────────┐    ┌────────────▼────────────┐
│  Blockchain RPC (Alchemy)│    │  Smart Contracts Layer   │
│  - Read/Write Events     │    │  (Sepolia Testnet)       │
│  - Transaction Submission│    │  - MarketFactory         │
└──────────────────────────┘    │  - Markets (Binary)      │
                                │  - Vault (ETH Custody)   │
                                │  - OracleAdapter         │
                                │  - OracleBudget          │
                                │  - QuoteVerifier         │
                                │  - SettlementEngine      │
                                │  - PlatformTreasury      │
                                └──────────────────────────┘
```

## Architecture Decisions

### Why LMSR?

The Logarithmic Market Scoring Rule (LMSR) provides:
- **Bounded loss**: Maximum loss = `b * ln(m)` where `m` = number of outcomes
- **Continuous liquidity**: Market makers can always buy/sell at computed price
- **Efficient capital**: No idle liquidity; prices adjust to supply/demand

### Why Optimistic Oracle?

- **Lower cost**: No real-time oracle service required
- **Scalable**: Disputes handled off-chain until escalation
- **Transparent**: Community validates outcomes collaboratively

### Why Off-Chain Quotes?

- **Gas efficiency**: Quote generation doesn't consume gas
- **Real-time feedback**: Immediate price updates for UX
- **Replay protection**: Nonce + signature prevents duplication

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Foundry
- PostgreSQL
- Git

### 1. Install dependencies

```bash
cd dapp
npm install

cd ../foundry
forge install
```

### 2. Configure environment variables

Create `dapp/.env.local` and populate the values relevant to your setup.

```env
# Public chain and wallet config
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id

# Public contract addresses
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS=0x...
NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS=0x...
NEXT_PUBLIC_SETTLEMENT_ENGINE_ADDRESS=0x...
NEXT_PUBLIC_ADMIN_ADDRESS=0x...

# Database
NEXT_PUBLIC_DATABASE_URL=postgresql://user:password@host:5432/dbname
NEXT_PUBLIC_DIRECT_URL=postgresql://user:password@host:5432/dbname

# Server-side operational secrets
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
ADMIN_SECRET=replace-me
CRON_SECRET=replace-me
ENCRYPTION_KEY=64_hex_chars

# Optional integrations
NEXT_PUBLIC_PINATA_API_KEY=your-pinata-key
NEXT_PUBLIC_PINATA_SECRET_KEY=your-pinata-secret
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs/

# Quote generation
CHAIN_ID=11155111
QUOTE_VERIFIER_ADDRESS=0x...
QUOTE_SIGNER_KEY=0x...
```

### 3. Run the dApp

```bash
cd dapp
npm run prisma:generate
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

### dApp

```bash
cd dapp
npm run dev
npm run build
npm run start
npm run lint
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
npm run sync-events
npm run register-market
```

### Contracts

```bash
cd foundry
forge build
forge test -vvv
forge coverage --report lcov
make build
make test
make deploy-local
make deploy-sepolia
make verify-all-contracts
```

## Testing and Quality

- Foundry unit tests for core contracts.
- Integration-style tests for market flow and fund flow.
- Oracle and settlement behavior tests.
- Invariant-focused coverage for market state and lifecycle assumptions.
- Type-checked application code and linting support in the dApp.

## Deployment Notes

The deployment flow is centered around [`foundry/script/DeployPlatform.s.sol`](./foundry/script/DeployPlatform.s.sol), which deploys the protocol components in a deterministic nonce-based sequence and precomputes dependent addresses before instantiation.

The Foundry `Makefile` includes helpers for:

- local deployment
- Sepolia deployment
- resume deployment
- Etherscan verification per contract
- batch verification of the protocol suite

## Strengths

- Strong separation between protocol primitives and application services.
- Good choice of testing framework and contract organization for a Web3 project.
- Thoughtful handling of quote verification, nonces, and role-gated operations.
- Realistic operator workflows beyond a basic hackathon demo.
- End-to-end monorepo structure that shows both smart contract and product engineering ability.

## Current Gaps Before Mainnet Readiness

- No audit or formal verification evidence included.
- Operational secrets and environment handling would benefit from tightening and standardization.
- No explicit CI, monitoring, incident runbooks, or production deployment documentation in the root repo.
- Frontend/backend automated test strategy is not yet as visible as the contract testing story.
- Economic attack analysis and oracle game-theory documentation could be expanded further.

---

## Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Commit changes with clear messages: `git commit -m "Add amazing feature"`.
4. Push to your branch: `git push origin feature/amazing-feature`.
5. Open a Pull Request with a detailed description, screenshots (if UI), and test plan.

### Contribution Areas

- Smart contract gas & security optimizations.
- Frontend UX/UI enhancements for traders, creators, and oracle participants.
- Backend API, database indexing, and sync performance improvements.
- Additional test coverage (contracts, API routes, UI).
- Documentation and examples (recipes, tutorials, diagrams).
- Bug fixes and corner case handling.

### Development Best Practices

- Write tests for all new features and bug fixes.
- Ensure linting passes: `npm run lint` in dapp/, `forge test` in foundry/.
- Document public APIs and non-trivial logic paths.
- Follow the existing code style and patterns.
- Update this README (and any in-code docs) when behavior changes.

---

## License

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) file for details.

---

## Contact & Support

- **Deployment**: Vercel (Frontend) + Sepolia (Smart Contracts)
- **Network**: Ethereum Sepolia Testnet
- **Status**: Production-Ready (Testnet)

---

**Built with ❤️ for transparent, trustless prediction markets.**