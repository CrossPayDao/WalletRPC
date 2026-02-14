# WalletRPC

WalletRPC is a multi-chain wallet application focused on wallet import, asset visibility, transaction execution, and multisig account operations over RPC.
It provides a unified frontend experience for key EVM/TRON wallet flows, with automated test coverage to keep critical behaviors stable.

## Features

- Import wallet using mnemonic phrases or private keys
- View balances and transaction history across supported chains
- Send native-token and ERC20-style token transfers
- Track and operate Safe-style multisig accounts
- Built-in unit, component, and end-to-end UI automation tests

## Tech Stack

- Frontend: React + TypeScript + Vite
- Styling/UI: Tailwind CSS + custom UI components
- Testing: Vitest + Testing Library + Playwright
- Chain SDK: ethers

## Quick Start

1. Install dependencies  
   `npm install`
2. Configure environment variables  
   Set `GEMINI_API_KEY` in `.env.local`
3. Start the development server  
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
