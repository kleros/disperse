export enum AppState {
  WALLET_REQUIRED = 0,
  NETWORK_UNAVAILABLE = 1,
  UNLOCK_WALLET = 2,
  CONNECTED_TO_WALLET = 3,
  SELECTED_CURRENCY = 4,
  ENTERED_AMOUNTS = 5,
}

// Arbitrum Sepolia is the expected network for this app
export const EXPECTED_CHAIN_ID = 421614; // Arbitrum Sepolia
