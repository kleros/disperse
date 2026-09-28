# wagmi disperse

A modern web application for distributing ETH and ERC20 tokens to multiple recipients in a single transaction, built with [wagmi](https://wagmi.sh/), [viem](https://viem.sh/), and [React](https://react.dev/).

Deployed at [disperse.app](https://disperse.app/).

## Overview

Disperse is a decentralized application that simplifies the process of sending multiple token transfers in one transaction. This can save significant gas costs and time when distributing tokens to many addresses.

Key features:
- Distribute ETH/native coins to multiple addresses
- Distribute ERC20 tokens to multiple addresses
- Support for multiple networks (including mainnet, testnets, and custom networks)
- Auto-detection of deployed Disperse contracts
- Deploy your own Disperse contract if needed
- Input validation and balance tracking
- Support for CSV import of recipient addresses and amounts

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- pnpm (or npm/yarn)

### Installation

1. Clone this repository
```bash
gh repo clone banteg/disperse
cd disperse/wagmi-disperse
```

2. Install dependencies
```bash
pnpm install
```

3. Start the development server
```bash
pnpm dev
```

4. Open [http://localhost:5173](http://localhost:5173) to view the app in your browser

## Environment Variables

None are required to run locally. Copy `.env.example` to `.env.local` (git-ignored) to set them.

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `VITE_WC_PROJECT_ID` | WalletConnect connector (`src/wagmi.ts`) | `YOUR_PROJECT_ID` placeholder | Recommended in production. Without a real [WalletConnect dashboard](https://dashboard.walletconnect.com) project ID, WalletConnect (mobile wallets via QR) won't work; injected wallets such as MetaMask still do. |
| `VITE_CONNECTIONS_URL` | "add university court users" section (`src/utils/recentConnections.ts`) | `/api/listConnections` | The default path is proxied to the University Court's `listConnections` Netlify function by the Vite dev server (`vite.config.ts`) and by `public/_redirects` on Netlify, because the function sends no CORS headers. Override only when hosting elsewhere, pointing at an endpoint that allows CORS from this app's origin. |
| `ETHERSCAN_API_KEY` | `@wagmi/cli` (`wagmi.config.ts`) | `YOUR_API_KEY` placeholder | Only needed to regenerate `src/generated.ts` with `pnpm exec wagmi generate`; not read by the app. |

`VITE_*` variables are inlined into the client bundle at build time, so set them in the build environment (e.g. Netlify's build settings), and treat them as public — never put secrets in them.

## Building for Production

```bash
pnpm build
```

This will generate a production-ready build in the `dist` directory.

## Technology Stack

- [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
- [React](https://react.dev/) - A JavaScript library for building user interfaces
- [wagmi](https://wagmi.sh/) - React Hooks for Ethereum
- [viem](https://viem.sh/) - TypeScript Interface for Ethereum
- [TanStack Query](https://tanstack.com/query) - Asynchronous state management

## Contract Details

The app can work with:

1. Legacy Disperse contracts deployed on various networks
2. CreateX deployed contracts
3. Custom deployed Disperse contracts

The contract provides functions to:
- `disperseEther`: Distribute native currency (ETH, etc.)
- `disperseToken`: Distribute ERC20 tokens efficiently
- `disperseTokenSimple`: Alternative method for token distribution
