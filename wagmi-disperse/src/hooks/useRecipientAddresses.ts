import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress } from "viem";

export const RECIPIENT_ADDRESSES_STORAGE_KEY = "disperse_scanned_addresses";

function loadAddresses(): `0x${string}`[] {
  try {
    const stored = localStorage.getItem(RECIPIENT_ADDRESSES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      // Drop corrupt entries so they can't break later add/remove calls
      return parsed
        .filter((addr): addr is string => typeof addr === "string" && isAddress(addr))
        .map((addr) => addr.toLowerCase() as `0x${string}`);
    }
  } catch (error) {
    console.error("Failed to load addresses from localStorage:", error);
  }
  return [];
}

/**
 * Shared recipient address list (filled by the QR scanner and the recent users loader),
 * persisted to localStorage.
 */
export function useRecipientAddresses() {
  const [addresses, setAddresses] = useState<`0x${string}`[]>(loadAddresses);
  // Updated synchronously on every mutation so back-to-back calls (e.g. rapid QR scans)
  // dedupe against the latest list rather than a stale render.
  const addressesRef = useRef(addresses);

  useEffect(() => {
    try {
      localStorage.setItem(RECIPIENT_ADDRESSES_STORAGE_KEY, JSON.stringify(addresses));
    } catch (error) {
      console.error("Failed to save addresses to localStorage:", error);
    }
  }, [addresses]);

  /** Merges addresses (lowercased, case-insensitive dedupe). Returns how many were new. */
  const addAddresses = useCallback((newAddresses: readonly string[]): number => {
    const seen = new Set(addressesRef.current.map((addr) => addr.toLowerCase()));
    const fresh: `0x${string}`[] = [];
    for (const addr of newAddresses) {
      const normalized = addr.toLowerCase() as `0x${string}`;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      fresh.push(normalized);
    }
    if (fresh.length === 0) return 0;
    addressesRef.current = [...addressesRef.current, ...fresh];
    setAddresses(addressesRef.current);
    return fresh.length;
  }, []);

  const removeAddress = useCallback((address: string) => {
    const target = address.toLowerCase();
    addressesRef.current = addressesRef.current.filter((addr) => addr.toLowerCase() !== target);
    setAddresses(addressesRef.current);
  }, []);

  return { addresses, addAddresses, removeAddress };
}
