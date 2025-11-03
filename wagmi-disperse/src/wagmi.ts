import { http, createConfig } from "wagmi";
import { arbitrumSepolia, mainnet, arbitrum, sepolia, optimism, gnosis } from "wagmi/chains";
import type { Chain } from "wagmi/chains";
import { coinbaseWallet, injected, metaMask, walletConnect } from "wagmi/connectors";

// Include common chains so users can switch FROM them TO Arbitrum Sepolia
// The app will only work on Arbitrum Sepolia, but we need other chains in config
// so wagmi can handle switching from them
const supportedChains = [
  arbitrumSepolia,  // The ONLY chain where the app actually works
  mainnet,          // Common chains users might be on
  arbitrum,
  optimism,
  sepolia,
  gnosis,
] as [Chain, ...Chain[]];

export const config = createConfig({
  chains: supportedChains,
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet(),
    walletConnect({ projectId: import.meta.env.VITE_WC_PROJECT_ID || "YOUR_PROJECT_ID" }),
  ],
  transports: Object.fromEntries(supportedChains.map((chain) => [chain.id, http()])),
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
