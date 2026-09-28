import { isAddress } from "viem";

// Proxied to https://v2-university.kleros.builders/.netlify/functions/listConnections
// (vite dev proxy + public/_redirects), since the upstream function sends no CORS headers.
export const CONNECTIONS_URL = import.meta.env.VITE_CONNECTIONS_URL || "/api/listConnections";

export interface Connection {
  address: string;
  timestamp: string; // ISO 8601, UTC
}

export interface ExtractedAddresses {
  valid: `0x${string}`[]; // lowercased, deduplicated
  invalid: string[]; // trimmed, deduplicated
}

export async function fetchConnections(url: string = CONNECTIONS_URL, signal?: AbortSignal): Promise<Connection[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch connections: ${response.status} ${response.statusText}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Unexpected connections response: expected an array");
  }
  return data.filter(
    (entry): entry is Connection =>
      typeof entry === "object" &&
      entry !== null &&
      typeof entry.address === "string" &&
      typeof entry.timestamp === "string",
  );
}

/**
 * Keeps connections with a timestamp in [since, until], then deduplicates the
 * addresses (case-insensitive) and splits them by isAddress validity.
 * Entries with an unparseable timestamp are skipped since they can't be placed in the range.
 * With no `until` the range is open-ended ("until now"), so a server clock slightly ahead of
 * the client's doesn't drop the most recent connections.
 */
export function extractRecentAddresses(connections: Connection[], since: Date, until?: Date): ExtractedAddresses {
  const valid = new Set<`0x${string}`>();
  const invalid = new Set<string>();
  const from = since.getTime();
  const to = until?.getTime() ?? Number.POSITIVE_INFINITY;

  for (const { address, timestamp } of connections) {
    const time = Date.parse(timestamp);
    if (Number.isNaN(time) || time < from || time > to) continue;

    const trimmed = address.trim();
    if (isAddress(trimmed)) {
      valid.add(trimmed.toLowerCase() as `0x${string}`);
    } else {
      invalid.add(trimmed);
    }
  }

  return { valid: [...valid], invalid: [...invalid] };
}
