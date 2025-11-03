import { http, createConfig } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import type { Chain } from "wagmi/chains";
import { coinbaseWallet, injected, metaMask, walletConnect } from "wagmi/connectors";

// Use only Arbitrum Sepolia network
const validChains = [arbitrumSepolia] as [Chain, ...Chain[]];

export const config = createConfig({
  chains: validChains,
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet(),
    walletConnect({ projectId: import.meta.env.VITE_WC_PROJECT_ID || "YOUR_PROJECT_ID" }),
  ],
  transports: Object.fromEntries(validChains.map((chain) => [chain.id, http()])),
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
