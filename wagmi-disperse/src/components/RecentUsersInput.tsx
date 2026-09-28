import { memo, useCallback, useEffect, useRef, useState } from "react";
import { extractRecentAddresses, fetchConnections } from "../utils/recentConnections";

interface RecentUsersInputProps {
  /** Adds addresses to the shared recipient list; returns how many were actually new. */
  onAddressesAdd: (addresses: `0x${string}`[]) => number;
}

const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;

/** Formats a Date as local time for a datetime-local input (YYYY-MM-DDTHH:mm). */
export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "es"}`;

const RecentUsersInput = ({ onAddressesAdd }: RecentUsersInputProps) => {
  const [from, setFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - DEFAULT_RANGE_MS)));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [invalidAddresses, setInvalidAddresses] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleAdd = useCallback(async () => {
    setErrorMessage("");
    setSuccessMessage("");
    setInvalidAddresses([]);

    // datetime-local values parse as local time, which compares correctly against the UTC timestamps
    const since = new Date(from);
    if (!from || Number.isNaN(since.getTime())) {
      setErrorMessage("Please pick a valid start date and time");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    try {
      const connections = await fetchConnections(undefined, controller.signal);
      if (controller.signal.aborted) return;
      const { valid, invalid } = extractRecentAddresses(connections, since);
      const added = valid.length > 0 ? onAddressesAdd(valid) : 0;
      const alreadyListed = valid.length - added;

      setInvalidAddresses(invalid);
      if (valid.length === 0) {
        setSuccessMessage("no users connected in this range");
      } else {
        setSuccessMessage(
          `added ${plural(added, "address")}${alreadyListed > 0 ? ` (${alreadyListed} already in list)` : ""}`,
        );
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(`Failed to load university court users: ${(err as Error).message}`);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  }, [from, onAddressesAdd]);

  return (
    <section>
      <h2>add university court users</h2>
      <p>add the addresses of users who connected between the chosen date and now.</p>

      <div className="shadow">
        <label htmlFor="recent-users-from">from</label>
        <input
          id="recent-users-from"
          type="datetime-local"
          value={from}
          max={toDateTimeLocal(new Date())}
          onChange={(e) => setFrom(e.target.value)}
          className="amount-input"
        />
      </div>
      <p className="recent-users-hint">until now</p>

      <button type="button" onClick={handleAdd} disabled={isLoading} className="qr-scan-button">
        {isLoading ? "Loading..." : "Add University Court Users"}
      </button>

      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {successMessage && <p className="success-message">{successMessage}</p>}

      {invalidAddresses.length > 0 && (
        <div className="address-group">
          <h3>Invalid addresses ({invalidAddresses.length})</h3>
          <ul className="address-list">
            {invalidAddresses.map((address) => (
              <li key={address} className="address-item">
                <span className="address-text">{address}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default memo(RecentUsersInput);
