# WalletRPC

WalletRPC is a multi-chain wallet application focused on wallet import, asset visibility, transaction execution, and multisig account operations over RPC.
It provides a unified frontend experience for key EVM/TRON wallet flows, with automated test coverage to keep critical behaviors stable.

## Features

- Import wallet using mnemonic phrases or private keys
- View balances and transaction history across supported chains
- Send native-token and ERC20-style token transfers
- Track and operate Safe-style multisig accounts
- Built-in unit, component, and end-to-end UI automation tests
- Lifecycle-aware refresh strategy to avoid redundant RPC calls

## Tech Stack

- Frontend: React + TypeScript + Vite
- Styling/UI: Tailwind CSS + custom UI components
- Testing: Vitest + Testing Library + Playwright
- Chain SDK: ethers

## Quick Start

1. Install dependencies  
   `npm install`
2. Start the development server  
   `npm run dev`

## Testing

### Install test browsers (first time only)
`npm run test:e2e:install`

### Unit + component tests (Vitest)
`npm run test`

### E2E UI tests (Playwright)
- Headless (default):
  `npm run test:e2e`
- Headed (show browser window):
  `npm run test:e2e -- --headed`
- Interactive UI mode:
  `npm run test:e2e:ui`

### Run all tests
`npm run test:all`

## Product Docs (Chinese)

- Product documentation source of truth is under `/docs/product`.
- It contains product goals, requirement specs, user stories, lifecycle policies, and maintenance templates.
- Recommended entry file: `/docs/product/README.md`.

## Data Lifecycle And Refresh Policy

- Passive data fetches are throttled by a cooldown window to avoid repeated identical requests during rapid UI transitions.
- Manual refresh actions (balance refresh buttons) are treated as **force refresh** and bypass cooldown intentionally.
- Transaction receipt polling starts only when there are pending `submitted` transactions on the active chain.
- Post-confirmation balance refresh is coalesced, so multiple confirmations in the same window trigger only one refresh.
- Safe queue rendering is scoped by `chainId + safeAddress + nonce` to avoid cross-context data mixing.

## Notes For Maintainers

- If you add new auto-refresh paths, keep them event-driven (state changes, pending tx, user intent) rather than timer-driven.
- Prefer deduplication and short-lived caches for read RPCs; avoid indefinite cache growth.
- Keep all chain-facing hooks strongly typed; avoid `any` in hook params and transaction payload structures.
