# WalletRPC

A zero-backend, single-file privacy wallet. No key storage, no ads or tracking, fully client-side, built for privacy-focused, self-custody users.

WalletRPC is a multi-chain wallet UI that talks directly to blockchain nodes over RPC. It supports key EVM/TRON flows and Safe-style multisig operations without requiring any centralized backend services.

Status: **Beta**.

Official website: [wallet-rpc.cp.cash](https://wallet-rpc.cp.cash)

SEO focus keywords: privacy-first wallet, decentralized RPC wallet, zero-telemetry wallet, no-backend wallet, self-custody wallet, Safe multisig wallet, EVM/TRON wallet.

## Why This Exists

Most “wallet” products gradually become platforms: accounts, servers, analytics, user databases, and opaque background calls. WalletRPC takes the opposite stance:

- It is a tool, not a service.
- It should be deployable anywhere (including IPFS) without changing its trust model.
- It should be portable across RPC endpoints and chains without central dependencies.

## Principles (Non-Negotiable)

- **RPC-only**: business requests must only go to decentralized RPC endpoints (no centralized backend APIs).
- **Backend zero-dependency**: no server-side account system, no user database.
- **Zero telemetry**: no analytics scripts, tracking pixels, session recording, or behavior reporting.
- **Key safety**: mnemonic/private keys stay in browser memory only and are cleared from the import input after success.
- **Persistence boundary**: only non-sensitive preferences (e.g., custom RPC URLs, tracked Safes, custom tokens, language) may be saved to browser local storage.

See also:
- `docs/product/00-governance/immutable-principle-rpc-only.md`
- `docs/product/00-governance/scope-and-principles.md`

## Features

- Import wallets using mnemonic phrases or private keys (client-side only).
- View balances across supported chains.
- Send native-token and ERC20-style token transfers.
- Track and operate Safe-style multisig accounts (create/manage/execute from UI).
- Built-in in-app HTTP “Console” for inspecting network requests (local only, no telemetry).
- Unit tests + UI tests + E2E automation to keep critical behaviors stable.
- Lifecycle-aware refresh strategy to avoid redundant RPC calls.

## What This Project Does Not Do

- No centralized backend APIs.
- No user accounts.
- No email / phone / social login.
- No analytics.
- No on-chain data indexing service dependency.

If a feature requires a centralized service dependency to work reliably, it should not be added to this project.

## Security & Privacy Model (Important)

- This is a browser wallet UI. Your key material is handled in-memory and should never be sent over the network by the app.
- You are responsible for the RPC endpoint(s) you choose. RPC providers can observe metadata such as your IP address and request patterns.
- Beta software disclaimer: do not use with large amounts of funds until you have reviewed the code and are comfortable with the risk.

## Tech Stack

- Frontend: React + TypeScript + Vite
- Styling/UI: Tailwind CSS + custom UI components
- Testing: Vitest + Testing Library + Playwright
- Chain SDK: ethers

## Quick Start

```bash
npm install
npm run dev
```

## Common Commands

```bash
# Unit + component tests
npm run test

# Install Playwright browser (first time only)
npm run test:e2e:install

# E2E UI tests (Playwright)
npm run test:e2e

# E2E UI tests, show browser window
npm run test:e2e -- --headed

# E2E UI tests, interactive UI mode
npm run test:e2e:ui

# Build (multi-file)
npm run build

# Build (single-file deployable HTML)
npm run build:single
```

## Single-File Production Build (IPFS-Friendly)

To generate a single `index.html` that inlines all JS and CSS for one-file deployment:

```bash
npm run build:single
```

Output:
- `dist-single/index.html`

This artifact is designed to be hosted as a static file (including IPFS gateways) while keeping the same “no backend” trust model.

## Testing

- Unit/UI tests (Vitest): `npm run test`
- E2E tests (Playwright): `npm run test:e2e`
- All tests: `npm run test:all`

Note: `npm run test:e2e` runs headless by default. If you want to see the browser, use:

```bash
npm run test:e2e -- --headed
```

## Data Lifecycle & Refresh Policy

The wallet is designed to avoid “heartbeat” refresh loops that spam RPC endpoints.

- Passive reads are throttled by a cooldown window to avoid repeated identical requests during rapid UI transitions.
- Manual refresh actions are treated as **force refresh** and intentionally bypass cooldown.
- Transaction receipt polling starts only when there are pending `submitted` transactions on the active chain.
- Post-confirmation refresh is coalesced, so multiple confirmations in the same window trigger only one refresh.
- Safe-specific reads are field-selectable (e.g., do not poll Safe nonce unless it is required).

## Product Docs (Chinese)

Product documentation source of truth lives under:
- `docs/product`

Recommended entry:
- `docs/product/README.md`

Release notes:
- `docs/CHANGELOG.md`

R&D workflow (including verification/acceptance rules and testing principles):
- `docs/product/00-governance/development-process.md`

## Contributing

This repo follows a product-doc-first workflow:

- Update product docs first, then implement.
- Keep changes aligned with the immutable principles (RPC-only / zero-backend / zero-telemetry).
- Any bug fix must include at least one automated regression test (unit/UI/E2E), or it must be documented as an explicit exception with a follow-up plan.

To open an issue, use the provided GitHub issue templates:
- Token submission
- EVM chain submission
- Feature request

## License

No license file is currently included in this repository. If you intend this project to be open source, add a `LICENSE` file (e.g., MIT/Apache-2.0) and update this section accordingly.
