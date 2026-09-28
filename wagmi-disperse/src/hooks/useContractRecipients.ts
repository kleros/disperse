import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

const NO_ADDRESSES: ReadonlySet<`0x${string}`> = new Set();

/**
 * Finds recipients with code (smart contract wallets such as Safes, or EIP-7702 delegated EOAs).
 * Disperse's disperseEther pays with `transfer()`, whose 2300 gas stipend is not enough for their
 * fallback, so a single one of them reverts the whole batch.
 */
export function useContractRecipients(addresses: readonly `0x${string}`[], enabled: boolean) {
  const publicClient = usePublicClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["contractRecipients", publicClient?.chain.id, [...addresses].sort()],
    queryFn: async () => {
      if (!publicClient) return NO_ADDRESSES;
      const codes = await Promise.all(addresses.map((address) => publicClient.getCode({ address })));
      return new Set(addresses.filter((_, i) => !!codes[i] && codes[i] !== "0x")) as ReadonlySet<`0x${string}`>;
    },
    enabled: enabled && !!publicClient && addresses.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    // Stable reference when there's no data, so consumers can use it as an effect dependency
    contractAddresses: data ?? NO_ADDRESSES,
    isChecking: enabled && addresses.length > 0 && isLoading,
    isError,
  };
}
